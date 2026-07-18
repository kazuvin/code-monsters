from dataclasses import dataclass

import cv2
import numpy as np

from .background import remove_small_foreground_components
from .colors import quantize_rgb


@dataclass(frozen=True)
class Bounds:
    x: int
    y: int
    width: int
    height: int


def alpha_bounds(alpha: np.ndarray) -> Bounds | None:
    ys, xs = np.nonzero(alpha > 0)
    if len(xs) == 0:
        return None
    minimum_x = int(xs.min())
    maximum_x = int(xs.max())
    minimum_y = int(ys.min())
    maximum_y = int(ys.max())
    return Bounds(minimum_x, minimum_y, maximum_x - minimum_x + 1, maximum_y - minimum_y + 1)


def _resize_premultiplied(rgba: np.ndarray, width: int, height: int) -> np.ndarray:
    alpha = rgba[:, :, 3].astype(np.float32) / 255.0
    premultiplied = rgba[:, :, :3].astype(np.float32) * alpha[:, :, None]
    interpolation = cv2.INTER_AREA if width <= rgba.shape[1] and height <= rgba.shape[0] else cv2.INTER_LANCZOS4
    resized_alpha = cv2.resize(alpha, (width, height), interpolation=interpolation)
    resized_premultiplied = cv2.resize(premultiplied, (width, height), interpolation=interpolation)
    safe_alpha = np.maximum(resized_alpha, 1e-6)
    resized_rgb = np.clip(resized_premultiplied / safe_alpha[:, :, None], 0, 255).astype(np.uint8)
    return np.dstack((resized_rgb, np.clip(resized_alpha * 255, 0, 255).astype(np.uint8)))


def normalize_frame(
    rgba: np.ndarray,
    palette_colors: tuple[str, ...],
    canvas: dict[str, int | float],
    processing: dict[str, int | float | bool],
) -> tuple[np.ndarray, dict[str, int | float]]:
    bounds = alpha_bounds(rgba[:, :, 3])
    if bounds is None:
        raise ValueError("EMPTY_FOREGROUND: no foreground remained after background removal")

    cropped = rgba[bounds.y : bounds.y + bounds.height, bounds.x : bounds.x + bounds.width]
    available_width = int(canvas["width"]) - int(canvas["sideMargin"]) * 2
    available_height = int(canvas["height"]) - int(canvas["topMargin"]) - int(canvas["bottomMargin"])
    scale = min(available_width / bounds.width, available_height / bounds.height)
    resized_width = max(1, int(round(bounds.width * scale)))
    resized_height = max(1, int(round(bounds.height * scale)))
    resized = _resize_premultiplied(cropped, resized_width, resized_height)
    alpha_threshold = int(processing["alphaThreshold"])
    resized[:, :, 3] = np.where(resized[:, :, 3] >= alpha_threshold, 255, 0).astype(np.uint8)
    resized, removed_components = remove_small_foreground_components(
        resized, int(processing["minimumComponentArea"])
    )
    resized[:, :, :3] = quantize_rgb(resized[:, :, :3], resized[:, :, 3], palette_colors)

    normalized = np.zeros((int(canvas["height"]), int(canvas["width"]), 4), dtype=np.uint8)
    left = (int(canvas["width"]) - resized_width) // 2
    top = int(canvas["height"]) - int(canvas["bottomMargin"]) - resized_height
    normalized[top : top + resized_height, left : left + resized_width] = resized
    final_bounds = alpha_bounds(normalized[:, :, 3])
    if final_bounds is None:
        raise ValueError("EMPTY_FOREGROUND: no foreground remained after normalization")

    return normalized, {
        "sourceBoundsX": bounds.x,
        "sourceBoundsY": bounds.y,
        "sourceBoundsWidth": bounds.width,
        "sourceBoundsHeight": bounds.height,
        "normalizedBoundsX": final_bounds.x,
        "normalizedBoundsY": final_bounds.y,
        "normalizedBoundsWidth": final_bounds.width,
        "normalizedBoundsHeight": final_bounds.height,
        "scale": round(scale, 6),
        "removedSmallComponents": removed_components,
    }
