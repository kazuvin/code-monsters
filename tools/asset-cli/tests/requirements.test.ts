import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGameData, loadMotionConfig } from '../src/config.ts';
import { deriveMotionRequirements } from '../src/requirements.ts';

test('volt requirements include its starting chip and mirror encounter motions', async () => {
  const requirements = deriveMotionRequirements(await loadGameData(), await loadMotionConfig(), 'volt');

  assert.deepEqual(requirements.requiredMotionIds, [
    'idle',
    'move',
    'attack',
    'hit',
    'death',
    'retreat',
    'buff',
    'follow',
  ]);
  assert.equal(requirements.fallbacks.heavy, 'attack');
  assert.equal(requirements.fallbacks.thrown, 'hit');
  assert.ok(requirements.optionalMotionIds.includes('jump'));
});

test('bastion requirements include both authored rival protocols', async () => {
  const requirements = deriveMotionRequirements(await loadGameData(), await loadMotionConfig(), 'bastion');

  assert.ok(requirements.requiredMotionIds.includes('heavy'));
  assert.ok(requirements.requiredMotionIds.includes('poison'));
  assert.ok(!requirements.requiredMotionIds.includes('follow'));
});

test('relay requirements include its dash presentation', async () => {
  const requirements = deriveMotionRequirements(await loadGameData(), await loadMotionConfig(), 'relay');

  assert.ok(requirements.requiredMotionIds.includes('dash'));
  assert.ok(!requirements.requiredMotionIds.includes('follow'));
});
