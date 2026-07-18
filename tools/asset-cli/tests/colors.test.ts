import assert from 'node:assert/strict';
import test from 'node:test';
import { chooseBackgroundColor, deltaE } from '../src/colors.ts';

test('background selection chooses the candidate furthest from the unit palette', () => {
  const selected = chooseBackgroundColor(['#00FF00', '#FF00FF'], ['#00F000', '#202020'], 10);
  assert.equal(selected, '#FF00FF');
});

test('deltaE is zero for the same color', () => {
  assert.equal(deltaE('#39D9FF', '#39D9FF'), 0);
});
