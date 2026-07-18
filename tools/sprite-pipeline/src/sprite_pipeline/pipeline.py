import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageOps

from .background import remove_border_connected_background
from .colors import palette_hash
from .models import ProcessRequest
from .normalize import normalize_frame
from .quality import EvaluatedFrame, evaluate_quality, issue, summarize_issues
from .report import write_html_report, write_json


def _sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _sha256_file(path: Path) -> str:
    return _sha256_bytes(path.read_bytes())


def _load_rgba(path: Path) -> np.ndarray:
    with Image.open(path) as image:
        normalized = ImageOps.exif_transpose(image).convert("RGBA")
        return np.array(normalized, dtype=np.uint8)


def _save_rgba(path: Path, rgba: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(rgba, mode="RGBA").save(path, format="PNG", optimize=False, compress_level=9)


def _manifest_content_hash(manifest: dict[str, Any]) -> str:
    content = {
        "pipelineVersion": manifest["pipelineVersion"],
        "unitId": manifest["unitId"],
        "sheetSha256": manifest["sheet"]["sha256"],
        "paletteSha256": manifest["palette"]["sha256"],
        "motions": manifest["motions"],
        "frameHashes": [frame["sha256"] for frame in manifest["frames"]],
        "fallbacks": manifest["fallbacks"],
    }
    payload = json.dumps(content, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return _sha256_bytes(payload)


def process_request(request: ProcessRequest) -> dict[str, Any]:
    output_directory = request.output_directory
    frames_directory = output_directory / "frames"
    sheet_path = output_directory / "sprite-sheet.png"
    manifest_path = output_directory / "manifest.json"
    qa_directory = output_directory.parent / "qa"
    issues: list[dict[str, Any]] = []
    evaluated_frames: list[EvaluatedFrame] = []
    frame_paths: dict[tuple[str, int], Path] = {}

    canvas = request.settings["canvas"]
    background = request.settings["background"]
    processing = request.settings["processing"]
    accent_color = str(request.settings["unitAccentColor"]).upper()

    for frame in request.frames:
        try:
            source_rgba = _load_rgba(frame.path)
            without_background, background_metrics = remove_border_connected_background(
                source_rgba,
                request.background_color,
                float(background["removalDeltaE"]),
                int(processing["alphaThreshold"]),
            )
            normalized, normalization_metrics = normalize_frame(
                without_background,
                request.palette_colors,
                canvas,
                processing,
            )
            output_path = frames_directory / frame.motion_id / f"{frame.frame_index:03d}.png"
            _save_rgba(output_path, normalized)
            frame_paths[(frame.motion_id, frame.frame_index)] = output_path
            evaluated_frames.append(
                EvaluatedFrame(
                    motion_id=frame.motion_id,
                    frame_index=frame.frame_index,
                    rgba=normalized,
                    processing_metrics={**background_metrics, **normalization_metrics},
                )
            )
        except Exception as error:
            issues.append(
                issue(
                    "FRAME_PROCESSING_FAILED",
                    "error",
                    request.unit_id,
                    f"Failed to process {frame.path.name}: {error}",
                    "Inspect the source file and processing settings, then retry the run.",
                    frame.motion_id,
                    frame.frame_index,
                )
            )

    quality_issues, frame_metrics = evaluate_quality(
        request.unit_id,
        request.motions,
        evaluated_frames,
        request.palette_colors,
        accent_color,
        request.settings,
    )
    issues.extend(quality_issues)
    summary = summarize_issues(issues)

    motion_rows = [motion for motion in request.motions if any(frame.motion_id == motion.motion_id for frame in evaluated_frames)]
    maximum_frames = max((motion.expected_frames for motion in motion_rows), default=1)
    sheet = np.zeros(
        (len(motion_rows) * int(canvas["height"]), maximum_frames * int(canvas["width"]), 4), dtype=np.uint8
    )
    manifest_frames: list[dict[str, Any]] = []
    manifest_motions: list[dict[str, Any]] = []
    frame_lookup = {(frame.motion_id, frame.frame_index): frame for frame in evaluated_frames}
    for row_index, motion in enumerate(motion_rows):
        frame_ids: list[str] = []
        for frame_index in range(motion.expected_frames):
            frame = frame_lookup.get((motion.motion_id, frame_index))
            if frame is None:
                continue
            x = frame_index * int(canvas["width"])
            y = row_index * int(canvas["height"])
            sheet[y : y + int(canvas["height"]), x : x + int(canvas["width"])] = frame.rgba
            frame_id = f"{request.unit_id}.{motion.motion_id}.{frame_index:03d}"
            frame_ids.append(frame_id)
            manifest_frames.append(
                {
                    "frameId": frame_id,
                    "motionId": motion.motion_id,
                    "frameIndex": frame_index,
                    "rect": {
                        "x": x,
                        "y": y,
                        "width": int(canvas["width"]),
                        "height": int(canvas["height"]),
                    },
                    "pivot": {
                        "x": 0.5,
                        "y": round(float(canvas["bottomMargin"]) / float(canvas["height"]), 6),
                    },
                    "sha256": _sha256_file(frame_paths[(motion.motion_id, frame_index)]),
                }
            )
        manifest_motions.append(
            {
                "motionId": motion.motion_id,
                "fps": int(motion.fps) if motion.fps.is_integer() else motion.fps,
                "loop": motion.loop,
                "frameIds": frame_ids,
            }
        )

    _save_rgba(sheet_path, sheet)
    manifest: dict[str, Any] = {
        "schemaVersion": 1,
        "pipelineVersion": request.pipeline_version,
        "unitId": request.unit_id,
        "sourceRunId": request.run_id,
        "sourceGameSchemaVersion": request.source_game_schema_version,
        "coordinateSystem": "top-left",
        "sheet": {
            "fileName": sheet_path.name,
            "width": int(sheet.shape[1]),
            "height": int(sheet.shape[0]),
            "sha256": _sha256_file(sheet_path),
        },
        "palette": {
            "id": request.palette_id,
            "sha256": palette_hash(request.palette_colors),
            "colors": list(request.palette_colors),
        },
        "pixelsPerUnit": float(canvas["pixelsPerUnit"]),
        "motions": manifest_motions,
        "frames": manifest_frames,
        "fallbacks": request.fallbacks,
        "qaSummary": summary,
        "contentHash": "",
    }
    manifest["contentHash"] = _manifest_content_hash(manifest)
    write_json(manifest_path, manifest)

    report = {
        "schemaVersion": 1,
        "runId": request.run_id,
        "unitId": request.unit_id,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "summary": summary,
        "issues": issues,
        "frameMetrics": frame_metrics,
    }
    report_path = qa_directory / "report.json"
    write_json(report_path, report)
    write_html_report(qa_directory / "report.html", report, "../processed/sprite-sheet.png")
    return {
        "manifest": str(manifest_path),
        "report": str(report_path),
        "sheet": str(sheet_path),
        "summary": summary,
    }
