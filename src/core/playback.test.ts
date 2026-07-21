import { describe, expect, it } from 'vitest';
import { playbackFrameMs } from './playback';
import type { GameData } from './types';

describe('battle playback speed', () => {
  it('uses a readable base pulse and exact 1x, 2x, and 3x rates', () => {
    const data = { rules: { pulseAnimationMs: 480 } } as GameData;

    expect(playbackFrameMs(data, 1)).toBe(480);
    expect(playbackFrameMs(data, 2)).toBe(240);
    expect(playbackFrameMs(data, 3)).toBe(160);
  });
});
