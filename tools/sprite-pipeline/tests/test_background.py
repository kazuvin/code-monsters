import unittest

import numpy as np

from sprite_pipeline.background import remove_border_connected_background


class BackgroundRemovalTests(unittest.TestCase):
    def test_only_border_connected_chroma_is_removed(self) -> None:
        image = np.zeros((9, 9, 4), dtype=np.uint8)
        image[:, :, :] = [0, 255, 0, 255]
        image[2:7, 2:7, :3] = [36, 41, 50]
        image[4, 4, :3] = [0, 255, 0]

        result, metrics = remove_border_connected_background(image, "#00FF00", 5, 128)

        self.assertEqual(0, result[0, 0, 3])
        self.assertEqual(255, result[4, 4, 3])
        self.assertGreater(metrics["removedBackgroundPixels"], 0)


if __name__ == "__main__":
    unittest.main()
