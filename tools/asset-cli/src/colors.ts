function hexToRgb(value: string): [number, number, number] {
  const normalized = value.replace(/^#/, '');
  if (!/^[0-9a-f]{6}$/i.test(normalized)) throw new Error(`Invalid color: ${value}`);
  return [0, 2, 4].map((offset) => Number.parseInt(normalized.slice(offset, offset + 2), 16)) as [
    number,
    number,
    number,
  ];
}

function pivotRgb(value: number): number {
  const normalized = value / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

function rgbToLab(value: string): [number, number, number] {
  const [red, green, blue] = hexToRgb(value).map(pivotRgb);
  const x = (red * 0.4124 + green * 0.3576 + blue * 0.1805) / 0.95047;
  const y = red * 0.2126 + green * 0.7152 + blue * 0.0722;
  const z = (red * 0.0193 + green * 0.1192 + blue * 0.9505) / 1.08883;
  const pivot = (channel: number) => (channel > 0.008856 ? Math.cbrt(channel) : 7.787 * channel + 16 / 116);
  const fx = pivot(x);
  const fy = pivot(y);
  const fz = pivot(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function deltaE(left: string, right: string): number {
  const leftLab = rgbToLab(left);
  const rightLab = rgbToLab(right);
  return Math.sqrt(leftLab.reduce((sum, channel, index) => sum + (channel - rightLab[index]) ** 2, 0));
}

export function chooseBackgroundColor(candidates: string[], palette: string[], minimumDeltaE: number): string {
  const ranked = candidates
    .map((candidate) => ({ candidate, distance: Math.min(...palette.map((color) => deltaE(candidate, color))) }))
    .sort((left, right) => right.distance - left.distance);
  const selected = ranked[0];
  if (!selected || selected.distance < minimumDeltaE) {
    throw new Error(
      `No configured background color is far enough from the palette; best deltaE=${selected?.distance.toFixed(2) ?? 'n/a'}`,
    );
  }
  return selected.candidate.toUpperCase();
}
