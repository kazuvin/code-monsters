import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class FrameInput:
    motion_id: str
    frame_index: int
    path: Path


@dataclass(frozen=True)
class MotionInput:
    motion_id: str
    expected_frames: int
    fps: float
    loop: bool
    fallback_motion_id: str | None


@dataclass(frozen=True)
class ProcessRequest:
    request_path: Path
    run_id: str
    unit_id: str
    source_game_schema_version: int
    pipeline_version: int
    output_directory: Path
    background_color: str
    palette_id: str
    palette_colors: tuple[str, ...]
    settings: dict[str, Any]
    motions: tuple[MotionInput, ...]
    fallbacks: dict[str, str]
    frames: tuple[FrameInput, ...]


def _require_dict(value: Any, name: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError(f"{name} must be an object")
    return value


def _require_list(value: Any, name: str) -> list[Any]:
    if not isinstance(value, list) or not value:
        raise ValueError(f"{name} must be a non-empty array")
    return value


def load_request(path: Path) -> ProcessRequest:
    request_path = path.resolve()
    raw = _require_dict(json.loads(request_path.read_text(encoding="utf-8")), "request")
    if raw.get("schemaVersion") != 1:
        raise ValueError(f"Unsupported process request schemaVersion: {raw.get('schemaVersion')}")

    palette = _require_dict(raw.get("palette"), "palette")
    colors = tuple(str(color).upper() for color in _require_list(palette.get("colors"), "palette.colors"))
    if len(set(colors)) != len(colors):
        raise ValueError("palette.colors must not contain duplicates")

    motions = tuple(
        MotionInput(
            motion_id=str(entry["motionId"]),
            expected_frames=int(entry["frames"]),
            fps=float(entry["fps"]),
            loop=bool(entry["loop"]),
            fallback_motion_id=entry.get("fallbackMotionId"),
        )
        for entry in (_require_dict(value, "motions[]") for value in _require_list(raw.get("motions"), "motions"))
    )
    motion_ids = {motion.motion_id for motion in motions}
    if len(motion_ids) != len(motions):
        raise ValueError("motions must have unique motionId values")

    frames: list[FrameInput] = []
    seen_frames: set[tuple[str, int]] = set()
    for value in _require_list(raw.get("frames"), "frames"):
        entry = _require_dict(value, "frames[]")
        motion_id = str(entry["motionId"])
        frame_index = int(entry["frameIndex"])
        key = (motion_id, frame_index)
        if motion_id not in motion_ids:
            raise ValueError(f"Unknown frame motionId: {motion_id}")
        if frame_index < 0 or key in seen_frames:
            raise ValueError(f"Invalid or duplicate frame: {motion_id}[{frame_index}]")
        source_path = Path(str(entry["path"]))
        if not source_path.is_absolute():
            source_path = request_path.parent / source_path
        source_path = source_path.resolve()
        if not source_path.is_file():
            raise FileNotFoundError(f"Source frame does not exist: {source_path}")
        seen_frames.add(key)
        frames.append(FrameInput(motion_id=motion_id, frame_index=frame_index, path=source_path))

    output_directory = Path(str(raw["outputDirectory"]))
    if not output_directory.is_absolute():
        output_directory = request_path.parent / output_directory

    return ProcessRequest(
        request_path=request_path,
        run_id=str(raw["runId"]),
        unit_id=str(raw["unitId"]),
        source_game_schema_version=int(raw["sourceGameSchemaVersion"]),
        pipeline_version=int(raw["pipelineVersion"]),
        output_directory=output_directory.resolve(),
        background_color=str(raw["backgroundColor"]).upper(),
        palette_id=str(palette["id"]),
        palette_colors=colors,
        settings=_require_dict(raw.get("settings"), "settings"),
        motions=motions,
        fallbacks={str(key): str(value) for key, value in _require_dict(raw.get("fallbacks"), "fallbacks").items()},
        frames=tuple(sorted(frames, key=lambda frame: (frame.motion_id, frame.frame_index))),
    )
