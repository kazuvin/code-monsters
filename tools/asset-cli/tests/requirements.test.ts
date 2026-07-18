import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGameData, loadMotionConfig } from '../src/config.ts';
import { deriveMotionRequirements } from '../src/requirements.ts';

test('volt requirements include base motion and its fixed follow-up reaction', async () => {
  const requirements = deriveMotionRequirements(await loadGameData(), await loadMotionConfig(), 'volt');

  assert.deepEqual(requirements.requiredMotionIds, ['idle', 'move', 'attack', 'hit', 'death', 'follow']);
  assert.equal(requirements.fallbacks.heavy, 'attack');
  assert.equal(requirements.fallbacks.thrown, 'hit');
  assert.ok(requirements.optionalMotionIds.includes('jump'));
});

test('wrath requires berserk but not volt follow', async () => {
  const requirements = deriveMotionRequirements(await loadGameData(), await loadMotionConfig(), 'wrath');

  assert.ok(requirements.requiredMotionIds.includes('berserk'));
  assert.ok(!requirements.requiredMotionIds.includes('follow'));
});
