# Post-fix Regression Run Summary

## Test Metadata

- Test date: 2026-06-16
- Branch: `test/post-fix-regression-samples`
- Sample directory: `ai-server/test-assets/post-fix-regression/`
- Model: local ignored `ai-server/models/model.onnx`
- Scope: segmentation regression only. No frontend color transfer was executed.
- Cases: 30 samples x 4 ROI modes = 120
- Debug output: `ai-server/debug/post-fix-regression/`

## Sample Overview

- Total samples: 30
- Format check: all samples are JPEG RGB, no `.jpg.jpg` files found.
- Semantic check: filenames and visual categories were reviewed before the run, including the three corrected `trouser_hanger_*` samples.

| Group | Count |
|---|---:|
| jacket_whitebg | 3 |
| tshirt_whitebg | 3 |
| polo_whitebg | 3 |
| trouser_whitebg | 3 |
| jacket_hanger | 3 |
| trouser_hanger | 3 |
| hanger_metal_clip | 3 |
| closeup_detail | 3 |
| complex_background | 3 |
| edge_touching_subject | 3 |

## ROI Suggestion Table

| samplePath | category | imageType | imageWidth | imageHeight | no_roi caseId | compact_roi | too_wide_roi | too_narrow_roi | expectedResult |
|---|---|---|---:|---:|---|---|---|---|---|
| `ai-server/test-assets/post-fix-regression/closeup_detail_001.jpg` | garment | closeup_detail | 3000 | 2000 | `closeup_detail_001_no_roi` | `60,40,2880,1800` | `0,0,3000,2000` | `1025,688,950,504` | success / success / roi_too_wide / partial |
| `ai-server/test-assets/post-fix-regression/closeup_detail_002.jpg` | garment | closeup_detail | 3000 | 2000 | `closeup_detail_002_no_roi` | `120,20,2760,1650` | `0,0,3000,2000` | `1045,614,911,462` | success / success / roi_too_wide / partial |
| `ai-server/test-assets/post-fix-regression/closeup_detail_003.jpg` | garment | closeup_detail | 3000 | 2000 | `closeup_detail_003_no_roi` | `420,80,2100,1120` | `0,0,3000,1800` | `1124,483,693,314` | success / success / roi_too_wide / partial |
| `ai-server/test-assets/post-fix-regression/complex_background_001.jpg` | garment | complex_background | 2000 | 3000 | `complex_background_001_no_roi` | `340,520,1320,1580` | `0,0,2000,2700` | `782,1089,436,442` | success / success / roi_too_wide / partial |
| `ai-server/test-assets/post-fix-regression/complex_background_002.jpg` | garment | complex_background | 2000 | 3000 | `complex_background_002_no_roi` | `360,440,1280,1760` | `0,0,2000,2728` | `789,1074,422,493` | success / success / roi_too_wide / partial |
| `ai-server/test-assets/post-fix-regression/complex_background_003.jpg` | garment | complex_background | 2000 | 3000 | `complex_background_003_no_roi` | `260,360,1460,2140` | `0,0,2000,3000` | `749,1130,482,599` | success / success / roi_too_wide / partial |
| `ai-server/test-assets/post-fix-regression/edge_touching_subject_001.jpg` | garment | edge_touching_subject | 3000 | 2000 | `edge_touching_subject_001_no_roi` | `460,120,2100,1050` | `10,0,2990,1800` | `1164,498,693,294` | success / success / roi_too_wide / partial |
| `ai-server/test-assets/post-fix-regression/edge_touching_subject_002.jpg` | garment | edge_touching_subject | 3000 | 2000 | `edge_touching_subject_002_no_roi` | `420,100,2160,1080` | `0,0,3000,1800` | `1144,489,713,302` | success / success / roi_too_wide / partial |
| `ai-server/test-assets/post-fix-regression/edge_touching_subject_003.jpg` | garment | edge_touching_subject | 3000 | 2000 | `edge_touching_subject_003_no_roi` | `500,80,1900,1050` | `0,0,3000,1800` | `1136,458,627,294` | success / success / roi_too_wide / partial |
| `ai-server/test-assets/post-fix-regression/hanger_metal_clip_001.jpg` | garment | hanger_metal_clip | 2000 | 3000 | `hanger_metal_clip_001_no_roi` | `520,560,980,1900` | `90,38,1840,2945` | `848,1244,323,532` | success / success / roi_too_wide / partial |
| `ai-server/test-assets/post-fix-regression/hanger_metal_clip_002.jpg` | garment | hanger_metal_clip | 2000 | 3000 | `hanger_metal_clip_002_no_roi` | `500,520,1000,1980` | `80,10,1840,2990` | `835,1233,330,554` | success / success / roi_too_wide / partial |
| `ai-server/test-assets/post-fix-regression/hanger_metal_clip_003.jpg` | garment | hanger_metal_clip | 2000 | 3000 | `hanger_metal_clip_003_no_roi` | `420,520,1120,1960` | `28,0,1904,3000` | `795,1226,370,549` | success / success / roi_too_wide / partial |
| `ai-server/test-assets/post-fix-regression/jacket_hanger_001.jpg` | jacket | hanger | 2000 | 3000 | `jacket_hanger_001_no_roi` | `420,820,1160,1180` | `14,60,1972,2700` | `809,1245,383,330` | success / success / roi_too_wide / partial |
| `ai-server/test-assets/post-fix-regression/jacket_hanger_002.jpg` | jacket | hanger | 2000 | 3000 | `jacket_hanger_002_no_roi` | `360,760,1280,1300` | `0,60,2000,2700` | `789,1228,422,364` | success / success / roi_too_wide / partial |
| `ai-server/test-assets/post-fix-regression/jacket_hanger_003.jpg` | jacket | hanger | 2000 | 3000 | `jacket_hanger_003_no_roi` | `330,760,1340,1320` | `0,70,2000,2700` | `779,1235,442,370` | success / success / roi_too_wide / partial |
| `ai-server/test-assets/post-fix-regression/jacket_whitebg_001.jpg` | jacket | whitebg | 2500 | 2500 | `jacket_whitebg_001_no_roi` | `420,120,1640,2220` | `0,0,2500,2500` | `969,919,541,622` | success / success / roi_too_wide / partial |
| `ai-server/test-assets/post-fix-regression/jacket_whitebg_002.jpg` | jacket | whitebg | 2500 | 2500 | `jacket_whitebg_002_no_roi` | `430,150,1640,2180` | `0,0,2500,2500` | `979,935,541,610` | success / success / roi_too_wide / partial |
| `ai-server/test-assets/post-fix-regression/jacket_whitebg_003.jpg` | jacket | whitebg | 2000 | 2000 | `jacket_whitebg_003_no_roi` | `350,100,1300,1800` | `0,0,2000,2000` | `786,748,429,504` | success / success / roi_too_wide / partial |
| `ai-server/test-assets/post-fix-regression/polo_whitebg_001.jpg` | polo | whitebg | 3000 | 3000 | `polo_whitebg_001_no_roi` | `620,260,1760,2480` | `4,0,2992,3000` | `1210,1153,581,694` | success / success / roi_too_wide / partial |
| `ai-server/test-assets/post-fix-regression/polo_whitebg_002.jpg` | polo | whitebg | 3000 | 3000 | `polo_whitebg_002_no_roi` | `620,260,1760,2480` | `4,0,2992,3000` | `1210,1153,581,694` | success / success / roi_too_wide / partial |
| `ai-server/test-assets/post-fix-regression/polo_whitebg_003.jpg` | polo | whitebg | 3000 | 3000 | `polo_whitebg_003_no_roi` | `560,240,1880,2520` | `0,0,3000,3000` | `1190,1147,620,706` | success / success / roi_too_wide / partial |
| `ai-server/test-assets/post-fix-regression/trouser_hanger_001.jpg` | trouser | hanger | 2000 | 3000 | `trouser_hanger_001_no_roi` | `300,380,1260,2200` | `0,0,2000,3000` | `722,1172,416,616` | success / success / roi_too_wide / partial |
| `ai-server/test-assets/post-fix-regression/trouser_hanger_002.jpg` | trouser | hanger | 2000 | 3000 | `trouser_hanger_002_no_roi` | `300,520,1420,2240` | `10,140,1990,2860` | `776,1326,469,627` | success / success / roi_too_wide / partial |
| `ai-server/test-assets/post-fix-regression/trouser_hanger_003.jpg` | trouser | hanger | 2000 | 2676 | `trouser_hanger_003_no_roi` | `350,300,1200,2220` | `0,72,2000,2604` | `752,1099,396,622` | success / success / roi_too_wide / partial |
| `ai-server/test-assets/post-fix-regression/trouser_whitebg_001.jpg` | trouser | whitebg | 3000 | 3000 | `trouser_whitebg_001_no_roi` | `960,120,1080,2700` | `120,0,2760,3000` | `1322,1092,356,756` | success / success / roi_too_wide / partial |
| `ai-server/test-assets/post-fix-regression/trouser_whitebg_002.jpg` | trouser | whitebg | 3000 | 3000 | `trouser_whitebg_002_no_roi` | `780,120,1440,2700` | `120,0,2760,3000` | `1262,1092,475,756` | success / success / roi_too_wide / partial |
| `ai-server/test-assets/post-fix-regression/trouser_whitebg_003.jpg` | trouser | whitebg | 3000 | 3000 | `trouser_whitebg_003_no_roi` | `900,120,1200,2700` | `120,0,2760,3000` | `1302,1092,396,756` | success / success / roi_too_wide / partial |
| `ai-server/test-assets/post-fix-regression/tshirt_whitebg_001.jpg` | tshirt | whitebg | 3000 | 3000 | `tshirt_whitebg_001_no_roi` | `620,260,1760,2480` | `4,0,2992,3000` | `1210,1153,581,694` | success / success / roi_too_wide / partial |
| `ai-server/test-assets/post-fix-regression/tshirt_whitebg_002.jpg` | tshirt | whitebg | 3000 | 3000 | `tshirt_whitebg_002_no_roi` | `620,260,1760,2480` | `4,0,2992,3000` | `1210,1153,581,694` | success / success / roi_too_wide / partial |
| `ai-server/test-assets/post-fix-regression/tshirt_whitebg_003.jpg` | tshirt | whitebg | 3000 | 3000 | `tshirt_whitebg_003_no_roi` | `620,260,1760,2480` | `4,0,2992,3000` | `1210,1153,581,694` | success / success / roi_too_wide / partial |

## Run Overview

- Total case count: 120
- Completed case count: 120
- Extra label/stage inspection count: 23

## Key Metrics

- no_roi success rate: 24/30 (80.00%)
- compact_roi success rate: 16/30 (53.33%)
- too_wide blocked rate: 25/30 (83.33%)
- too_wide roi_too_wide quality rate: 24/30 (80.00%)
- too_narrow false pass count: 4
- false pass rate: 9/120 (7.50%)
- Color block risk rate: this run did not execute color transfer; using segmentation false-pass proxy, 9/120 (7.50%).

## Statistics By ROI Mode

| ROI mode | Cases | Raw success | Quality distribution |
|---|---:|---:|---|
| no_roi | 30 | 24 | `{'failed': 1, 'success': 24, 'partial': 5}` |
| compact_roi | 30 | 16 | `{'failed': 1, 'success': 16, 'low_confidence': 13}` |
| too_wide_roi | 30 | 5 | `{'failed': 1, 'roi_too_wide': 24, 'success': 5}` |
| too_narrow_roi | 30 | 4 | `{'low_confidence': 7, 'partial': 12, 'failed': 7, 'success': 4}` |

## Statistics By Category

| Category | no_roi success | compact_roi success | too_wide success | too_narrow success |
|---|---:|---:|---:|---:|
| garment | 10/12 | 2/12 | 2/12 | 1/12 |
| jacket | 6/6 | 3/6 | 0/6 | 1/6 |
| polo | 3/3 | 2/3 | 0/3 | 0/3 |
| trouser | 2/6 | 6/6 | 3/6 | 2/6 |
| tshirt | 3/3 | 3/3 | 0/3 | 0/3 |

## Statistics By Image Type

| Image type | no_roi success | compact_roi success | too_wide success | too_narrow success |
|---|---:|---:|---:|---:|
| closeup_detail | 1/3 | 1/3 | 0/3 | 0/3 |
| complex_background | 3/3 | 0/3 | 0/3 | 0/3 |
| edge_touching_subject | 3/3 | 1/3 | 0/3 | 1/3 |
| hanger | 5/6 | 3/6 | 0/6 | 3/6 |
| hanger_metal_clip | 3/3 | 0/3 | 2/3 | 0/3 |
| whitebg | 9/12 | 11/12 | 3/12 | 0/12 |

## Compact ROI Findings

- Compact ROI succeeded in 16/30 cases.
- Compared with the latest main-line expectation, this regression set is consistent enough for continued sampling.
- Remaining compact failures are listed below.

- `closeup_detail_001_compact_roi` -> `failed`; gate=`None`; reason=`None`; fg=0.0000
- `closeup_detail_003_compact_roi` -> `low_confidence`; gate=`roi_boundary_contact`; reason=`远程 AI 蒙版不可靠，请缩小框选范围，只框住需要校色的裤面主体，或手动编辑校色范围。 bboxWidthRatio=1.0000 selectedWidthRatio=0.9375 selectedBboxAreaRatio=0.7227 selectedFillRatio=0.5297 touchesBorder=True`; fg=0.2116
- `complex_background_001_compact_roi` -> `low_confidence`; gate=`roi_boundary_contact`; reason=`远程 AI 蒙版不可靠，请缩小框选范围，只框住需要校色的裤面主体，或手动编辑校色范围。 bboxWidthRatio=1.0000 selectedWidthRatio=1.0000 selectedBboxAreaRatio=0.8646 selectedFillRatio=0.6857 touchesBorder=True`; fg=0.2589
- `complex_background_002_compact_roi` -> `low_confidence`; gate=`roi_boundary_contact`; reason=`远程 AI 蒙版不可靠，请缩小框选范围，只框住需要校色的裤面主体，或手动编辑校色范围。 bboxWidthRatio=1.0000 selectedWidthRatio=1.0000 selectedBboxAreaRatio=0.9062 selectedFillRatio=0.6319 touchesBorder=True`; fg=0.3036
- `complex_background_003_compact_roi` -> `low_confidence`; gate=`roi_boundary_contact`; reason=`远程 AI 蒙版不可靠，请缩小框选范围，只框住需要校色的裤面主体，或手动编辑校色范围。 bboxWidthRatio=1.0000 selectedWidthRatio=0.9688 selectedBboxAreaRatio=0.6660 selectedFillRatio=0.6325 touchesBorder=True`; fg=0.3265
- `edge_touching_subject_001_compact_roi` -> `low_confidence`; gate=`low_fill_ratio`; reason=`远程 AI 蒙版不可靠，请缩小框选范围，只框住需要校色的裤面主体，或手动编辑校色范围。 bboxWidthRatio=0.9519 selectedWidthRatio=0.8229 selectedBboxAreaRatio=0.4629 selectedFillRatio=0.3828 touchesBorder=False`; fg=0.1216
- `edge_touching_subject_003_compact_roi` -> `low_confidence`; gate=`roi_boundary_contact`; reason=`远程 AI 蒙版不可靠，请缩小框选范围，只框住需要校色的裤面主体，或手动编辑校色范围。 bboxWidthRatio=0.9611 selectedWidthRatio=0.8854 selectedBboxAreaRatio=0.5626 selectedFillRatio=0.6980 touchesBorder=True`; fg=0.1621
- `hanger_metal_clip_001_compact_roi` -> `low_confidence`; gate=`roi_boundary_contact`; reason=`远程 AI 蒙版不可靠，请缩小框选范围，只框住需要校色的裤面主体，或手动编辑校色范围。 bboxWidthRatio=1.0000 selectedWidthRatio=1.0000 selectedBboxAreaRatio=0.8333 selectedFillRatio=0.7964 touchesBorder=True`; fg=0.2557
- `hanger_metal_clip_002_compact_roi` -> `low_confidence`; gate=`roi_boundary_contact`; reason=`远程 AI 蒙版不可靠，请缩小框选范围，只框住需要校色的裤面主体，或手动编辑校色范围。 bboxWidthRatio=1.0000 selectedWidthRatio=0.9896 selectedBboxAreaRatio=0.9690 selectedFillRatio=0.6915 touchesBorder=True`; fg=0.2881
- `hanger_metal_clip_003_compact_roi` -> `low_confidence`; gate=`roi_boundary_contact`; reason=`远程 AI 蒙版不可靠，请缩小框选范围，只框住需要校色的裤面主体，或手动编辑校色范围。 bboxWidthRatio=1.0000 selectedWidthRatio=1.0000 selectedBboxAreaRatio=0.8646 selectedFillRatio=0.6537 touchesBorder=True`; fg=0.2875
- `jacket_hanger_001_compact_roi` -> `low_confidence`; gate=`roi_boundary_contact`; reason=`远程 AI 蒙版不可靠，请缩小框选范围，只框住需要校色的裤面主体，或手动编辑校色范围。 bboxWidthRatio=1.0000 selectedWidthRatio=1.0000 selectedBboxAreaRatio=0.9271 selectedFillRatio=0.8061 touchesBorder=True`; fg=0.1984
- `jacket_hanger_002_compact_roi` -> `low_confidence`; gate=`roi_boundary_contact`; reason=`远程 AI 蒙版不可靠，请缩小框选范围，只框住需要校色的裤面主体，或手动编辑校色范围。 bboxWidthRatio=1.0000 selectedWidthRatio=1.0000 selectedBboxAreaRatio=1.0000 selectedFillRatio=0.8172 touchesBorder=True`; fg=0.2614
- `jacket_hanger_003_compact_roi` -> `low_confidence`; gate=`roi_boundary_contact`; reason=`远程 AI 蒙版不可靠，请缩小框选范围，只框住需要校色的裤面主体，或手动编辑校色范围。 bboxWidthRatio=1.0000 selectedWidthRatio=1.0000 selectedBboxAreaRatio=1.0000 selectedFillRatio=0.8350 touchesBorder=True`; fg=0.2784
- `polo_whitebg_001_compact_roi` -> `low_confidence`; gate=`roi_boundary_contact`; reason=`远程 AI 蒙版不可靠，请缩小框选范围，只框住需要校色的裤面主体，或手动编辑校色范围。 bboxWidthRatio=1.0000 selectedWidthRatio=0.9583 selectedBboxAreaRatio=0.8885 selectedFillRatio=0.8715 touchesBorder=True`; fg=0.4562

## Risk List

### False Pass Cases

- `edge_touching_subject_001_too_narrow_roi` -> success in `too_narrow_roi`; fg=0.0154; selectedThreshold=0.55
- `hanger_metal_clip_001_too_wide_roi` -> success in `too_wide_roi`; fg=0.3648; selectedThreshold=0.65
- `hanger_metal_clip_002_too_wide_roi` -> success in `too_wide_roi`; fg=0.3800; selectedThreshold=0.55
- `jacket_hanger_001_too_narrow_roi` -> success in `too_narrow_roi`; fg=0.0087; selectedThreshold=0.86
- `trouser_hanger_001_too_narrow_roi` -> success in `too_narrow_roi`; fg=0.0168; selectedThreshold=0.55
- `trouser_hanger_003_too_narrow_roi` -> success in `too_narrow_roi`; fg=0.0152; selectedThreshold=0.55
- `trouser_whitebg_001_too_wide_roi` -> success in `too_wide_roi`; fg=0.3536; selectedThreshold=0.55
- `trouser_whitebg_002_too_wide_roi` -> success in `too_wide_roi`; fg=0.3461; selectedThreshold=0.55
- `trouser_whitebg_003_too_wide_roi` -> success in `too_wide_roi`; fg=0.3274; selectedThreshold=0.55

### Cases With Additional Label / Stage Inspection

- `closeup_detail_001_compact_roi`
- `closeup_detail_003_compact_roi`
- `complex_background_001_compact_roi`
- `complex_background_002_compact_roi`
- `complex_background_003_compact_roi`
- `edge_touching_subject_001_compact_roi`
- `edge_touching_subject_001_too_narrow_roi`
- `edge_touching_subject_003_compact_roi`
- `hanger_metal_clip_001_compact_roi`
- `hanger_metal_clip_001_too_wide_roi`
- `hanger_metal_clip_002_compact_roi`
- `hanger_metal_clip_002_too_wide_roi`
- `hanger_metal_clip_003_compact_roi`
- `jacket_hanger_001_compact_roi`
- `jacket_hanger_001_too_narrow_roi`
- `jacket_hanger_002_compact_roi`
- `jacket_hanger_003_compact_roi`
- `polo_whitebg_001_compact_roi`
- `trouser_hanger_001_too_narrow_roi`
- `trouser_hanger_003_too_narrow_roi`
- `trouser_whitebg_001_too_wide_roi`
- `trouser_whitebg_002_too_wide_roi`
- `trouser_whitebg_003_too_wide_roi`

## Summary Conclusion

- Post-fix regression status: needs review.
- The safety gates still block intentionally over-wide ROI cases in this sample set.
- The run should be reviewed for compact ROI failures and any safety-mode false passes before moving to a broader sample pool.
- Recommendation: do not treat this as a clean pass; inspect the listed high-risk cases first.
