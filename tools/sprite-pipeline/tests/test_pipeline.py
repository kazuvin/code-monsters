import json
import tempfile
import unittest
from pathlib import Path

import numpy as np
from PIL import Image

from sprite_pipeline.models import load_request
from sprite_pipeline.pipeline import process_request


def write_source_frame(path: Path, offset: int) -> None:
    rgba = np.zeros((256, 256, 4), dtype=np.uint8)
    rgba[:, :, :] = [0, 255, 0, 255]
    rgba[48:208, 88 + offset : 168 + offset, :3] = [36, 41, 50]
    rgba[74:144, 104 + offset : 152 + offset, :3] = [57, 217, 255]
    rgba[48:208, 88 + offset : 168 + offset, 3] = 255
    Image.fromarray(rgba, mode="RGBA").save(path)


class PipelineTests(unittest.TestCase):
    def test_process_is_deterministic_and_manifest_matches_sheet(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            sources = root / "source"
            sources.mkdir()
            write_source_frame(sources / "000.png", 0)
            write_source_frame(sources / "001.png", 4)
            request_path = root / "request.json"
            request = {
                "schemaVersion": 1,
                "runId": "test-run",
                "unitId": "volt",
                "sourceGameSchemaVersion": 8,
                "pipelineVersion": 1,
                "outputDirectory": str(root / "processed-a"),
                "backgroundColor": "#00FF00",
                "palette": {
                    "id": "test-palette",
                    "colors": ["#242932", "#39D9FF", "#EEF4FB"],
                },
                "settings": {
                    "canvas": {
                        "width": 32,
                        "height": 32,
                        "topMargin": 2,
                        "sideMargin": 2,
                        "bottomMargin": 3,
                        "pixelsPerUnit": 32,
                    },
                    "background": {"removalDeltaE": 10},
                    "processing": {"minimumComponentArea": 1, "alphaThreshold": 128},
                    "quality": {
                        "minimumOccupancyRatio": 0.05,
                        "maximumOccupancyRatio": 0.9,
                        "minimumTransparencyRatio": 0.1,
                        "maximumTransparencyRatio": 0.95,
                        "maximumConnectedComponents": 4,
                        "maximumBaselineDriftPixels": 1,
                        "maximumCentroidDriftRatio": 0.2,
                        "maximumDimensionChangeRatio": 0.4,
                        "minimumAdjacentDifferenceRatio": 0.001,
                        "maximumAdjacentDifferenceRatio": 0.9,
                        "minimumLoopClosureIou": 0.3,
                        "minimumAccentRatio": 0.001,
                        "maximumBorderForegroundPixels": 0,
                    },
                    "unitAccentColor": "#39D9FF",
                },
                "motions": [
                    {
                        "motionId": "idle",
                        "frames": 2,
                        "fps": 8,
                        "loop": True,
                        "fallbackMotionId": None,
                    }
                ],
                "fallbacks": {"move": "idle"},
                "frames": [
                    {"motionId": "idle", "frameIndex": 0, "path": str(sources / "000.png")},
                    {"motionId": "idle", "frameIndex": 1, "path": str(sources / "001.png")},
                ],
            }
            request_path.write_text(json.dumps(request), encoding="utf-8")
            first = process_request(load_request(request_path))
            first_manifest = json.loads(Path(first["manifest"]).read_text(encoding="utf-8"))
            first_sheet = Path(first["sheet"]).read_bytes()

            request["outputDirectory"] = str(root / "processed-b")
            request_path.write_text(json.dumps(request), encoding="utf-8")
            second = process_request(load_request(request_path))
            second_manifest = json.loads(Path(second["manifest"]).read_text(encoding="utf-8"))

            self.assertEqual(first_sheet, Path(second["sheet"]).read_bytes())
            self.assertEqual(first_manifest["contentHash"], second_manifest["contentHash"])
            self.assertEqual([64, 32], [first_manifest["sheet"]["width"], first_manifest["sheet"]["height"]])
            self.assertEqual(2, len(first_manifest["frames"]))
            self.assertEqual(0, first["summary"]["errors"])

    def test_missing_frame_is_a_blocking_quality_error(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / "000.png"
            write_source_frame(source, 0)
            request_path = root / "request.json"
            request_path.write_text(
                json.dumps(
                    {
                        "schemaVersion": 1,
                        "runId": "missing-frame",
                        "unitId": "volt",
                        "sourceGameSchemaVersion": 8,
                        "pipelineVersion": 1,
                        "outputDirectory": str(root / "processed"),
                        "backgroundColor": "#00FF00",
                        "palette": {"id": "test-palette", "colors": ["#242932", "#39D9FF"]},
                        "settings": {
                            "canvas": {
                                "width": 32,
                                "height": 32,
                                "topMargin": 2,
                                "sideMargin": 2,
                                "bottomMargin": 3,
                                "pixelsPerUnit": 32,
                            },
                            "background": {"removalDeltaE": 10},
                            "processing": {"minimumComponentArea": 1, "alphaThreshold": 128},
                            "quality": {
                                "minimumOccupancyRatio": 0.05,
                                "maximumOccupancyRatio": 0.9,
                                "minimumTransparencyRatio": 0.1,
                                "maximumTransparencyRatio": 0.95,
                                "maximumConnectedComponents": 4,
                                "maximumBaselineDriftPixels": 1,
                                "maximumCentroidDriftRatio": 0.2,
                                "maximumDimensionChangeRatio": 0.4,
                                "minimumAdjacentDifferenceRatio": 0.001,
                                "maximumAdjacentDifferenceRatio": 0.9,
                                "minimumLoopClosureIou": 0.3,
                                "minimumAccentRatio": 0.001,
                                "maximumBorderForegroundPixels": 0,
                            },
                            "unitAccentColor": "#39D9FF",
                        },
                        "motions": [
                            {
                                "motionId": "idle",
                                "frames": 2,
                                "fps": 8,
                                "loop": True,
                                "fallbackMotionId": None,
                            }
                        ],
                        "fallbacks": {"move": "idle"},
                        "frames": [{"motionId": "idle", "frameIndex": 0, "path": str(source)}],
                    }
                ),
                encoding="utf-8",
            )

            result = process_request(load_request(request_path))
            report = json.loads(Path(result["report"]).read_text(encoding="utf-8"))

            self.assertEqual(1, result["summary"]["errors"])
            self.assertIn("FRAME_COUNT_MISMATCH", {entry["code"] for entry in report["issues"]})


if __name__ == "__main__":
    unittest.main()
