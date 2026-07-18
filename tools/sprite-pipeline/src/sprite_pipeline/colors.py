import hashlib
import json

import cv2
import numpy as np


def hex_to_rgb(value: str) -> tuple[int, int, int]:
    normalized = value.removeprefix("#")
    if len(normalized) != 6:
        raise ValueError(f"Expected #RRGGBB color, received: {value}")
    return tuple(int(normalized[index : index + 2], 16) for index in (0, 2, 4))


def rgb_to_hex(rgb: np.ndarray | tuple[int, int, int]) -> str:
    values = [int(value) for value in rgb]
    return f"#{values[0]:02X}{values[1]:02X}{values[2]:02X}"


def rgb_image_to_lab(rgb: np.ndarray) -> np.ndarray:
    normalized = rgb.astype(np.float32) / 255.0
    return cv2.cvtColor(normalized, cv2.COLOR_RGB2LAB)


def color_delta_e(left: str, right: str) -> float:
    colors = np.array([[hex_to_rgb(left), hex_to_rgb(right)]], dtype=np.uint8)
    labs = rgb_image_to_lab(colors)[0]
    return float(np.linalg.norm(labs[0] - labs[1]))


def quantize_rgb(rgb: np.ndarray, alpha: np.ndarray, palette_colors: tuple[str, ...]) -> np.ndarray:
    palette_rgb = np.array([hex_to_rgb(color) for color in palette_colors], dtype=np.uint8)
    palette_lab = rgb_image_to_lab(palette_rgb.reshape(1, -1, 3))[0]
    result = np.zeros_like(rgb, dtype=np.uint8)
    foreground = alpha > 0
    if not np.any(foreground):
        return result
    foreground_lab = rgb_image_to_lab(rgb)[foreground]
    distances = np.sum((foreground_lab[:, None, :] - palette_lab[None, :, :]) ** 2, axis=2)
    result[foreground] = palette_rgb[np.argmin(distances, axis=1)]
    return result


def palette_hash(colors: tuple[str, ...]) -> str:
    payload = json.dumps(list(colors), separators=(",", ":"), ensure_ascii=True).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()
