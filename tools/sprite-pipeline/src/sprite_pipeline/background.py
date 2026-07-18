import cv2
import numpy as np

from .colors import hex_to_rgb, rgb_image_to_lab


def remove_border_connected_background(
    rgba: np.ndarray,
    background_color: str,
    delta_e_threshold: float,
    alpha_threshold: int,
) -> tuple[np.ndarray, dict[str, float | int]]:
    rgb = rgba[:, :, :3]
    original_alpha = rgba[:, :, 3]
    image_lab = rgb_image_to_lab(rgb)
    background_rgb = np.array([[hex_to_rgb(background_color)]], dtype=np.uint8)
    background_lab = rgb_image_to_lab(background_rgb)[0, 0]
    distance = np.linalg.norm(image_lab - background_lab, axis=2)
    candidates = ((distance <= delta_e_threshold) & (original_alpha >= alpha_threshold)).astype(np.uint8)

    label_count, labels = cv2.connectedComponents(candidates, connectivity=8)
    touching_labels: set[int] = set()
    if label_count > 1:
        border_labels = np.concatenate((labels[0, :], labels[-1, :], labels[:, 0], labels[:, -1]))
        touching_labels = {int(label) for label in np.unique(border_labels) if label != 0}
    background_mask = np.isin(labels, tuple(touching_labels)) if touching_labels else np.zeros_like(candidates, dtype=bool)

    cleaned = rgba.copy()
    cleaned[:, :, 3] = np.where(background_mask, 0, original_alpha)
    cleaned[cleaned[:, :, 3] < alpha_threshold, 3] = 0
    foreground_pixels = int(np.count_nonzero(cleaned[:, :, 3]))
    return cleaned, {
        "removedBackgroundPixels": int(np.count_nonzero(background_mask)),
        "foregroundPixelsBeforeResize": foreground_pixels,
        "backgroundCandidateComponents": max(0, label_count - 1),
    }


def remove_small_foreground_components(rgba: np.ndarray, minimum_area: int) -> tuple[np.ndarray, int]:
    mask = (rgba[:, :, 3] > 0).astype(np.uint8)
    label_count, labels, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    removed = 0
    output = rgba.copy()
    for label in range(1, label_count):
        area = int(stats[label, cv2.CC_STAT_AREA])
        if area < minimum_area:
            output[labels == label] = 0
            removed += 1
    return output, removed
