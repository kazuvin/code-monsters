from dataclasses import dataclass
from typing import Any

import cv2
import numpy as np

from .colors import hex_to_rgb, rgb_to_hex
from .normalize import Bounds, alpha_bounds


@dataclass(frozen=True)
class EvaluatedFrame:
    motion_id: str
    frame_index: int
    rgba: np.ndarray
    processing_metrics: dict[str, Any]


def issue(
    code: str,
    severity: str,
    unit_id: str,
    message: str,
    suggested_action: str,
    motion_id: str | None = None,
    frame_index: int | None = None,
    measured_value: Any = None,
    threshold: Any = None,
) -> dict[str, Any]:
    return {
        "code": code,
        "severity": severity,
        "unitId": unit_id,
        "motionId": motion_id,
        "frameIndex": frame_index,
        "measuredValue": measured_value,
        "threshold": threshold,
        "message": message,
        "suggestedAction": suggested_action,
    }


def _component_count(alpha: np.ndarray) -> int:
    count, _ = cv2.connectedComponents((alpha > 0).astype(np.uint8), connectivity=8)
    return max(0, count - 1)


def _border_pixels(alpha: np.ndarray) -> int:
    border = np.concatenate((alpha[0, :], alpha[-1, :], alpha[:, 0], alpha[:, -1]))
    return int(np.count_nonzero(border))


def _centroid(alpha: np.ndarray) -> tuple[float, float]:
    ys, xs = np.nonzero(alpha > 0)
    if len(xs) == 0:
        return 0.0, 0.0
    return float(xs.mean() / alpha.shape[1]), float(ys.mean() / alpha.shape[0])


def _difference_ratio(left: np.ndarray, right: np.ndarray) -> float:
    return float(np.count_nonzero(np.any(left != right, axis=2)) / (left.shape[0] * left.shape[1]))


def _silhouette_iou(left: np.ndarray, right: np.ndarray) -> float:
    left_mask = left > 0
    right_mask = right > 0
    union = np.count_nonzero(left_mask | right_mask)
    return 1.0 if union == 0 else float(np.count_nonzero(left_mask & right_mask) / union)


def frame_metrics(frame: EvaluatedFrame, accent_color: str) -> dict[str, Any]:
    alpha = frame.rgba[:, :, 3]
    bounds = alpha_bounds(alpha)
    foreground_pixels = int(np.count_nonzero(alpha))
    total_pixels = int(alpha.shape[0] * alpha.shape[1])
    accent = np.array(hex_to_rgb(accent_color), dtype=np.uint8)
    accent_pixels = int(np.count_nonzero(np.all(frame.rgba[:, :, :3] == accent, axis=2) & (alpha > 0)))
    color_values = {
        rgb_to_hex(color)
        for color in np.unique(frame.rgba[alpha > 0, :3].reshape(-1, 3), axis=0)
    }
    centroid_x, centroid_y = _centroid(alpha)
    return {
        "motionId": frame.motion_id,
        "frameIndex": frame.frame_index,
        "width": int(frame.rgba.shape[1]),
        "height": int(frame.rgba.shape[0]),
        "foregroundPixels": foreground_pixels,
        "occupancyRatio": round(foreground_pixels / total_pixels, 6),
        "transparencyRatio": round(1 - foreground_pixels / total_pixels, 6),
        "connectedComponents": _component_count(alpha),
        "borderForegroundPixels": _border_pixels(alpha),
        "baselineY": bounds.y + bounds.height - 1 if bounds else None,
        "bounds": _bounds_dict(bounds),
        "centroidX": round(centroid_x, 6),
        "centroidY": round(centroid_y, 6),
        "accentRatio": round(accent_pixels / max(1, foreground_pixels), 6),
        "colors": sorted(color_values),
        **frame.processing_metrics,
    }


def _bounds_dict(bounds: Bounds | None) -> dict[str, int] | None:
    if bounds is None:
        return None
    return {"x": bounds.x, "y": bounds.y, "width": bounds.width, "height": bounds.height}


def evaluate_quality(
    unit_id: str,
    motions: tuple[Any, ...],
    frames: list[EvaluatedFrame],
    palette_colors: tuple[str, ...],
    accent_color: str,
    settings: dict[str, Any],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    thresholds = settings["quality"]
    canvas = settings["canvas"]
    issues: list[dict[str, Any]] = []
    metrics = [frame_metrics(frame, accent_color) for frame in frames]
    palette = {color.upper() for color in palette_colors}

    for motion in motions:
        actual = [frame for frame in frames if frame.motion_id == motion.motion_id]
        if len(actual) != motion.expected_frames:
            issues.append(
                issue(
                    "FRAME_COUNT_MISMATCH",
                    "error",
                    unit_id,
                    f"{motion.motion_id} has {len(actual)} frames; expected {motion.expected_frames}",
                    "Regenerate or import the missing frames before approval.",
                    motion_id=motion.motion_id,
                    measured_value=len(actual),
                    threshold=motion.expected_frames,
                )
            )

    for metric in metrics:
        motion_id = metric["motionId"]
        frame_index = metric["frameIndex"]
        if metric["width"] != int(canvas["width"]) or metric["height"] != int(canvas["height"]):
            issues.append(
                issue(
                    "FRAME_SIZE_MISMATCH",
                    "error",
                    unit_id,
                    "Normalized frame size does not match the configured canvas.",
                    "Reprocess the run with the canonical pipeline settings.",
                    motion_id,
                    frame_index,
                    [metric["width"], metric["height"]],
                    [canvas["width"], canvas["height"]],
                )
            )
        if metric["borderForegroundPixels"] > int(thresholds["maximumBorderForegroundPixels"]):
            issues.append(
                issue(
                    "FOREGROUND_TOUCHES_BORDER",
                    "error",
                    unit_id,
                    "Foreground pixels touch the frame border.",
                    "Increase source padding or reduce the normalized scale.",
                    motion_id,
                    frame_index,
                    metric["borderForegroundPixels"],
                    thresholds["maximumBorderForegroundPixels"],
                )
            )
        unknown_colors = sorted(set(metric["colors"]) - palette)
        if unknown_colors:
            issues.append(
                issue(
                    "PALETTE_COLOR_OUTSIDE_SET",
                    "error",
                    unit_id,
                    "Frame contains colors outside the approved palette.",
                    "Run deterministic palette quantization again.",
                    motion_id,
                    frame_index,
                    unknown_colors,
                    sorted(palette),
                )
            )
        for metric_name, minimum_name, maximum_name, code in (
            ("occupancyRatio", "minimumOccupancyRatio", "maximumOccupancyRatio", "OCCUPANCY_OUT_OF_RANGE"),
            (
                "transparencyRatio",
                "minimumTransparencyRatio",
                "maximumTransparencyRatio",
                "TRANSPARENCY_OUT_OF_RANGE",
            ),
        ):
            value = float(metric[metric_name])
            minimum = float(thresholds[minimum_name])
            maximum = float(thresholds[maximum_name])
            if value < minimum or value > maximum:
                issues.append(
                    issue(
                        code,
                        "warning",
                        unit_id,
                        f"{metric_name} is outside the configured review range.",
                        "Review the source crop and unit scale.",
                        motion_id,
                        frame_index,
                        value,
                        {"minimum": minimum, "maximum": maximum},
                    )
                )
        if metric["connectedComponents"] > int(thresholds["maximumConnectedComponents"]):
            issues.append(
                issue(
                    "TOO_MANY_COMPONENTS",
                    "warning",
                    unit_id,
                    "The silhouette contains many disconnected components.",
                    "Inspect for background noise, detached parts, or disappearing equipment.",
                    motion_id,
                    frame_index,
                    metric["connectedComponents"],
                    thresholds["maximumConnectedComponents"],
                )
            )
        if metric["accentRatio"] < float(thresholds["minimumAccentRatio"]):
            issues.append(
                issue(
                    "ACCENT_COLOR_MISSING",
                    "warning",
                    unit_id,
                    "The unit accent color is nearly absent.",
                    "Confirm that the identity reference and palette preserve the canonical unit color.",
                    motion_id,
                    frame_index,
                    metric["accentRatio"],
                    thresholds["minimumAccentRatio"],
                )
            )

    metric_by_key = {(entry["motionId"], entry["frameIndex"]): entry for entry in metrics}
    for motion in motions:
        sequence = sorted(
            [frame for frame in frames if frame.motion_id == motion.motion_id], key=lambda frame: frame.frame_index
        )
        if len(sequence) < 2:
            continue
        baselines = [metric_by_key[(frame.motion_id, frame.frame_index)]["baselineY"] for frame in sequence]
        if max(baselines) - min(baselines) > int(thresholds["maximumBaselineDriftPixels"]):
            issues.append(
                issue(
                    "BASELINE_DRIFT",
                    "warning",
                    unit_id,
                    "The foot baseline moves between frames.",
                    "Re-run anchor normalization or review airborne motion metadata.",
                    motion_id=motion.motion_id,
                    measured_value=max(baselines) - min(baselines),
                    threshold=thresholds["maximumBaselineDriftPixels"],
                )
            )
        centroids_x = [metric_by_key[(frame.motion_id, frame.frame_index)]["centroidX"] for frame in sequence]
        centroids_y = [metric_by_key[(frame.motion_id, frame.frame_index)]["centroidY"] for frame in sequence]
        centroid_drift = max(max(centroids_x) - min(centroids_x), max(centroids_y) - min(centroids_y))
        if centroid_drift > float(thresholds["maximumCentroidDriftRatio"]):
            issues.append(
                issue(
                    "CENTROID_DRIFT",
                    "warning",
                    unit_id,
                    "The foreground center of mass changes sharply between frames.",
                    "Inspect for identity drift, disappearing equipment, or inconsistent scale.",
                    motion_id=motion.motion_id,
                    measured_value=round(centroid_drift, 6),
                    threshold=thresholds["maximumCentroidDriftRatio"],
                )
            )
        widths = [metric_by_key[(frame.motion_id, frame.frame_index)]["bounds"]["width"] for frame in sequence]
        heights = [metric_by_key[(frame.motion_id, frame.frame_index)]["bounds"]["height"] for frame in sequence]
        dimension_change = max(max(widths) / max(1, min(widths)) - 1, max(heights) / max(1, min(heights)) - 1)
        if dimension_change > float(thresholds["maximumDimensionChangeRatio"]):
            issues.append(
                issue(
                    "SILHOUETTE_DIMENSION_CHANGE",
                    "warning",
                    unit_id,
                    "The silhouette dimensions change sharply between frames.",
                    "Review scale normalization and check that body parts or weapons did not disappear.",
                    motion_id=motion.motion_id,
                    measured_value=round(dimension_change, 6),
                    threshold=thresholds["maximumDimensionChangeRatio"],
                )
            )
        for left, right in zip(sequence, sequence[1:]):
            difference = _difference_ratio(left.rgba, right.rgba)
            metric_by_key[(right.motion_id, right.frame_index)]["differenceFromPrevious"] = round(difference, 6)
            if difference < float(thresholds["minimumAdjacentDifferenceRatio"]):
                issues.append(
                    issue(
                        "POSSIBLE_DUPLICATE_FRAME",
                        "warning",
                        unit_id,
                        "Adjacent frames are nearly identical.",
                        "Confirm that the motion contains intentional progression.",
                        right.motion_id,
                        right.frame_index,
                        round(difference, 6),
                        thresholds["minimumAdjacentDifferenceRatio"],
                    )
                )
            if difference > float(thresholds["maximumAdjacentDifferenceRatio"]):
                issues.append(
                    issue(
                        "ADJACENT_FRAME_CHANGE_TOO_LARGE",
                        "warning",
                        unit_id,
                        "Adjacent frames change too much for a stable identity.",
                        "Inspect for pose discontinuity, missing equipment, or identity drift.",
                        right.motion_id,
                        right.frame_index,
                        round(difference, 6),
                        thresholds["maximumAdjacentDifferenceRatio"],
                    )
                )
        if motion.loop:
            closure = _silhouette_iou(sequence[-1].rgba[:, :, 3], sequence[0].rgba[:, :, 3])
            if closure < float(thresholds["minimumLoopClosureIou"]):
                issues.append(
                    issue(
                        "LOOP_CLOSURE_MISMATCH",
                        "warning",
                        unit_id,
                        "The last and first silhouettes do not close cleanly.",
                        "Adjust the loop endpoints or regenerate the transition frames.",
                        motion_id=motion.motion_id,
                        measured_value=round(closure, 6),
                        threshold=thresholds["minimumLoopClosureIou"],
                    )
                )

    return issues, metrics


def summarize_issues(issues: list[dict[str, Any]]) -> dict[str, int]:
    return {
        "errors": sum(issue["severity"] == "error" for issue in issues),
        "warnings": sum(issue["severity"] == "warning" for issue in issues),
        "infos": sum(issue["severity"] == "info" for issue in issues),
    }
