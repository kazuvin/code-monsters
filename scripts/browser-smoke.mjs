import { chromium } from 'playwright-core';

const target = process.argv.slice(2).find((argument) => argument !== '--') ?? 'http://127.0.0.1:5173';
const battleBackgroundRatio = 1672 / 941;
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});

const longDrag = async (page, source, destination) => {
  const sourceBox = await source.boundingBox();
  const destinationBox = await destination.boundingBox();
  if (!sourceBox || !destinationBox) throw new Error('Could not measure drag targets');
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(380);
  await page.mouse.move(destinationBox.x + destinationBox.width / 2, destinationBox.y + destinationBox.height / 2, {
    steps: 8,
  });
  await page.mouse.up();
  await page.waitForTimeout(80);
};

const longTouch = async (page, client, source, destination) => {
  await source.scrollIntoViewIfNeeded();
  const sourceBox = await source.boundingBox();
  const destinationBox = await destination.boundingBox();
  if (!sourceBox || !destinationBox) throw new Error('Could not measure touch targets');
  const start = { x: sourceBox.x + sourceBox.width / 2, y: sourceBox.y + sourceBox.height / 2 };
  const end = { x: destinationBox.x + destinationBox.width / 2, y: destinationBox.y + destinationBox.height / 2 };
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
  await page.waitForTimeout(380);
  for (let step = 1; step <= 8; step += 1) {
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        {
          x: start.x + ((end.x - start.x) * step) / 8,
          y: start.y + ((end.y - start.y) * step) / 8,
        },
      ],
    });
    await page.waitForTimeout(16);
  }
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(100);
};

const advanceClock = async (page, durationMs, stepMs = 100) => {
  for (let elapsed = 0; elapsed < durationMs; elapsed += stepMs) {
    await page.clock.runFor(Math.min(stepMs, durationMs - elapsed));
  }
};

const errors = [];
const desktop = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
desktop.on('pageerror', (error) => errors.push(error.message));
desktop.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});

await desktop.goto(target, { waitUntil: 'networkidle' });
await desktop.getByRole('heading', { name: 'CODE MONSTERS' }).waitFor();

const checks = {
  circuitCells: await desktop.locator('.circuit-cell').count(),
  shopSlots: await desktop.locator('.shop-card, .shop-empty').count(),
};
if (checks.circuitCells !== 25) throw new Error(`Expected 25 circuit cells, found ${checks.circuitCells}`);
if (checks.shopSlots !== 5) throw new Error(`Expected 5 shop slots, found ${checks.shopSlots}`);
if ((await desktop.locator('.arena-fighter').count()) !== 0)
  throw new Error('Battle screen is visible during build phase');
if ((await desktop.locator('.circuit-cell .block-button').count()) !== 0)
  throw new Error('Player circuit should start empty');
if ((await desktop.locator('.rack-block').count()) !== 0) throw new Error('Skill rack should start empty');

const lockedOffer = desktop.locator('.shop-card').last();
const lockedTitle = (await lockedOffer.locator('.shop-block-button strong').textContent())?.trim();
await lockedOffer.locator('.lock-button').click();
if ((await lockedOffer.locator('.lock-button').getAttribute('aria-pressed')) !== 'true') {
  throw new Error('Shop lock did not enter its active state');
}
await desktop.getByRole('button', { name: 'ショップを更新' }).click();
const retainedOffer = desktop.locator('.shop-card').last();
if (
  (await retainedOffer.locator('.shop-block-button strong').textContent())?.trim() !== lockedTitle ||
  (await retainedOffer.locator('.lock-button').getAttribute('aria-pressed')) !== 'true'
) {
  throw new Error('Locked shop offer was not retained by reroll');
}

const firstOffer = desktop.locator('.shop-card').first();
await firstOffer.locator('.shop-block-button').click();
await desktop.getByRole('dialog').waitFor();
const offerDescription = (await desktop.locator('.dialog-copy > p').textContent())?.trim();
if (!offerDescription?.endsWith('。') || offerDescription.length < 18) {
  throw new Error(`Skill description is not a readable sentence: ${offerDescription}`);
}
await desktop.getByRole('button', { name: '詳細を閉じる' }).click();

const coinsBefore = Number((await desktop.locator('.coin-readout b').textContent())?.trim());
await firstOffer.getByRole('button', { name: /買う/ }).click();
const coinsAfter = Number((await desktop.locator('.coin-readout b').textContent())?.trim());
if (!(coinsAfter < coinsBefore)) throw new Error('Buying a skill did not spend coins');
if ((await desktop.locator('.shop-card').count()) !== 4) throw new Error('Purchased skill was not removed');

const firstCell = desktop.locator('[data-row="2"][data-column="0"]');
const firstRackSkill = desktop.locator('.rack-block').first();
const firstRackGlyph = (await firstRackSkill.locator('.block-core b').textContent())?.trim();
await longDrag(desktop, firstRackSkill, firstCell);
if ((await firstCell.locator('.block-core b').textContent())?.trim() !== firstRackGlyph) {
  throw new Error('Could not place the first purchased skill at the power source');
}

await desktop.locator('.shop-card').first().getByRole('button', { name: /買う/ }).click();
const secondCell = desktop.locator('[data-row="2"][data-column="1"]');
const secondRackSkill = desktop.locator('.rack-block').first();
const secondRackGlyph = (await secondRackSkill.locator('.block-core b').textContent())?.trim();
await longDrag(desktop, secondRackSkill, secondCell);
if ((await secondCell.locator('.block-core b').textContent())?.trim() !== secondRackGlyph) {
  throw new Error('Could not place the second purchased skill');
}

await secondCell.locator('.block-button').click();
await desktop.getByRole('dialog').waitFor();
if ((await desktop.getByRole('dialog').getByText('接続', { exact: true }).count()) !== 1) {
  throw new Error('Skill detail does not show its direction-neutral connections');
}
if ((await desktop.getByRole('dialog').locator('.block-port.is-input, .block-port.is-output').count()) !== 0) {
  throw new Error('Skill detail still distinguishes input and output ports');
}
const portsBefore = await desktop
  .locator('.dialog-block-preview .block-port')
  .evaluateAll((ports) => ports.map((port) => port.className).sort());
const rotateButton = desktop.getByRole('button', { name: /回す/ });
if ((await rotateButton.count()) > 0) {
  await rotateButton.click();
  const portsAfter = await desktop
    .locator('.dialog-block-preview .block-port')
    .evaluateAll((ports) => ports.map((port) => port.className).sort());
  if (JSON.stringify(portsBefore) === JSON.stringify(portsAfter))
    throw new Error('Skill rotation did not change its ports');
  for (let rotation = 0; rotation < 3; rotation += 1) {
    await rotateButton.click();
  }
} else if ((await desktop.getByText('形は固定', { exact: true }).count()) !== 1) {
  throw new Error('A fixed-direction skill did not explain its rotation lock');
}
await desktop.getByRole('button', { name: '詳細を閉じる' }).click();

const firstGlyph = (await firstCell.locator('.block-core b').textContent())?.trim();
const secondGlyph = (await secondCell.locator('.block-core b').textContent())?.trim();
await longDrag(desktop, firstCell.locator('.block-button'), secondCell);
if (
  (await firstCell.locator('.block-core b').textContent())?.trim() !== secondGlyph ||
  (await secondCell.locator('.block-core b').textContent())?.trim() !== firstGlyph
) {
  throw new Error('Could not swap circuit skills with long-press drag');
}

await desktop.screenshot({ path: '/tmp/code-monsters-circuit-desktop.png', fullPage: true });
await desktop.getByRole('button', { name: /戦闘開始/ }).click();
await desktop.locator('.battle-screen').waitFor();
const fighters = await desktop.locator('.arena-fighter').count();
if (fighters !== 2) throw new Error(`Expected 2 arena fighters, found ${fighters}`);
if ((await desktop.locator('.workspace-layout').count()) !== 0)
  throw new Error('Build screen remained visible in battle');
const desktopStage = await desktop.locator('.battle-stage').boundingBox();
if (!desktopStage || Math.abs(desktopStage.width / desktopStage.height - battleBackgroundRatio) > 0.03) {
  throw new Error(`Battle background is not displayed at its full image ratio: ${JSON.stringify(desktopStage)}`);
}
if ((await desktop.locator('.battle-circuit-summary').count()) !== 2) {
  throw new Error('Expected player and rival circuit summaries');
}
const desktopCircuitDeck = await desktop.locator('.battle-circuit-deck').boundingBox();
if (!desktopCircuitDeck || desktopCircuitDeck.y + desktopCircuitDeck.height > 1100) {
  throw new Error(`Desktop circuit summaries are not fully visible: ${JSON.stringify(desktopCircuitDeck)}`);
}
if ((await desktop.locator('.battle-circuit-cell').count()) !== 50) {
  throw new Error('Expected two complete 5x5 circuit summaries');
}
if (
  (await desktop.locator('.unit-health').count()) !== 2 ||
  (await desktop.locator('.unit-status-list').count()) !== 2
) {
  throw new Error('Compact health or status UI is missing from battle units');
}
const desktopUnitVisual = await desktop.locator('.arena-unit-visual').first().boundingBox();
const desktopHealth = await desktop.locator('.unit-health').first().boundingBox();
if (!desktopUnitVisual || desktopUnitVisual.height > 100) throw new Error('Desktop battle character is too prominent');
if (!desktopHealth || desktopHealth.width > 90 || desktopHealth.height > 12)
  throw new Error('Desktop health display is too prominent');
await desktop.getByText('TIME', { exact: true }).waitFor();
if ((await desktop.locator('.battle-time-rail').count()) !== 1) throw new Error('Timed overload rail is missing');
await desktop.waitForTimeout(600);
if ((await desktop.locator('.battle-circuit-cell.is-activated').count()) === 0) {
  throw new Error('Circuit summary did not show an activated skill');
}
if ((await desktop.locator('.battle-circuit-cell .block-port.is-conducting').count()) === 0) {
  throw new Error('Circuit summary did not show current moving along an edge');
}
const enemyMergeSkill = desktop.locator('.battle-circuit-summary.team-enemy .battle-circuit-skill[data-merge="true"]');
await enemyMergeSkill.waitFor({ timeout: 5000 });
await enemyMergeSkill.click();
await desktop.locator('.battle-buff-panel[data-buff-team="enemy"]').waitFor();
if (!(await desktop.getByText('相手の技', { exact: true }).count())) {
  throw new Error('Enemy skill detail does not identify its owner');
}
if (!(await desktop.locator('.dialog-merge-rule').textContent())?.includes('×2')) {
  throw new Error('Enemy merge skill detail does not show its doubled effect');
}
if (!(await desktop.getByRole('dialog').textContent())?.includes('接続左・上・右 · 合流')) {
  throw new Error('Enemy merge skill is mislabeled as a branch');
}
await desktop.screenshot({ path: '/tmp/code-monsters-circuit-buff-detail.png', fullPage: true });
await desktop.getByRole('button', { name: '詳細を閉じる' }).click();
await desktop.screenshot({ path: '/tmp/code-monsters-circuit-battle.png', fullPage: true });

const mobile = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  hasTouch: true,
  isMobile: true,
});
const mobileClient = await mobile.context().newCDPSession(mobile);
mobile.on('pageerror', (error) => errors.push(error.message));
mobile.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
await mobile.goto(target, { waitUntil: 'networkidle' });
const mobileCellBounds = await mobile.locator('.circuit-cell').evaluateAll((cells) =>
  cells.map((cell) => {
    const box = cell.getBoundingClientRect();
    return { left: box.left, right: box.right };
  }),
);
if (mobileCellBounds.some((box) => box.left < 0 || box.right > 390)) {
  throw new Error(`Mobile circuit board is clipped: ${JSON.stringify(mobileCellBounds)}`);
}
if ((await mobile.locator('.circuit-cell .block-button').count()) !== 0)
  throw new Error('Mobile player circuit should start empty');

await mobile.locator('.shop-card').first().getByRole('button', { name: /買う/ }).click();
await mobile.locator('.circuit-panel').evaluate((panel) => panel.scrollIntoView({ block: 'start' }));
const mobileFirst = mobile.locator('[data-row="2"][data-column="0"]');
await longTouch(mobile, mobileClient, mobile.locator('.rack-block').first(), mobileFirst);
await mobile.locator('.shop-card').first().getByRole('button', { name: /買う/ }).click();
await mobile.locator('.circuit-panel').evaluate((panel) => panel.scrollIntoView({ block: 'start' }));
const mobileSecond = mobile.locator('[data-row="2"][data-column="1"]');
await longTouch(mobile, mobileClient, mobile.locator('.rack-block').first(), mobileSecond);
if ((await mobileSecond.locator('.block-button').count()) !== 1) {
  throw new Error(
    `Could not place the second mobile skill: ${JSON.stringify({ rack: await mobile.locator('.rack-block').count(), board: await mobile.locator('.circuit-cell .block-button').count(), scrollY: await mobile.evaluate(() => window.scrollY) })}`,
  );
}
const mobileFirstGlyph = (await mobileFirst.locator('.block-core b').textContent())?.trim();
const mobileSecondGlyph = (await mobileSecond.locator('.block-core b').textContent())?.trim();
await longTouch(mobile, mobileClient, mobileFirst.locator('.block-button'), mobileSecond);
if (
  (await mobileFirst.locator('.block-core b').textContent())?.trim() !== mobileSecondGlyph ||
  (await mobileSecond.locator('.block-core b').textContent())?.trim() !== mobileFirstGlyph
) {
  throw new Error('Could not swap circuit skills on mobile viewport');
}

await mobileSecond.locator('.block-button').click();
await mobile.getByRole('dialog').waitFor();
await mobile.getByRole('button', { name: '詳細を閉じる' }).click();
const rerollButton = mobile.getByRole('button', { name: 'ショップを更新' });
await rerollButton.scrollIntoViewIfNeeded();
if (!(await rerollButton.isVisible())) throw new Error('Mobile reroll button is not visible');
await rerollButton.click();
await mobile.screenshot({ path: '/tmp/code-monsters-circuit-mobile.png', fullPage: true });

const horizontalOverflow = await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
if (horizontalOverflow > 1) throw new Error(`Mobile page overflows horizontally by ${horizontalOverflow}px`);
await mobile.getByRole('button', { name: /戦闘開始/ }).click();
await mobile.locator('.battle-screen').waitFor();
await mobile.waitForTimeout(600);
const mobileStage = await mobile.locator('.battle-stage').boundingBox();
if (!mobileStage || Math.abs(mobileStage.width / mobileStage.height - battleBackgroundRatio) > 0.03) {
  throw new Error(`Mobile battle background is not displayed at its full image ratio: ${JSON.stringify(mobileStage)}`);
}
const mobileCircuitDeck = await mobile.locator('.battle-circuit-deck').boundingBox();
if (!mobileCircuitDeck || mobileCircuitDeck.y < mobileStage.y + mobileStage.height - 1) {
  throw new Error('Mobile circuit summaries are not placed below the background');
}
const mobileUnitVisual = await mobile.locator('.arena-unit-visual').first().boundingBox();
const mobileHealth = await mobile.locator('.unit-health').first().boundingBox();
if (!mobileUnitVisual || mobileUnitVisual.height > 52) throw new Error('Mobile battle character is too prominent');
if (!mobileHealth || mobileHealth.width > 68 || mobileHealth.height > 9)
  throw new Error('Mobile health display is too prominent');
if ((await mobile.locator('.battle-circuit-cell.is-activated').count()) === 0) {
  throw new Error('Mobile circuit summary did not show an activated skill');
}
if ((await mobile.locator('.battle-projectile.effect-poison').count()) === 0) {
  throw new Error('Poison skill did not show a distinct projectile animation');
}
if ((await mobile.locator('.arena-fighter.team-enemy .poison-impact').count()) === 0) {
  throw new Error('Poison skill did not show an impact animation on its target');
}
if (!(await mobile.locator('.arena-fighter.team-enemy .combat-feedback').textContent())?.includes('毒')) {
  throw new Error('Poison impact did not explain its status increase');
}
const mobileMergeSkill = mobile.locator('.battle-circuit-summary.team-enemy .battle-circuit-skill[data-merge="true"]');
await mobileMergeSkill.waitFor({ timeout: 5000 });
await mobileMergeSkill.click();
await mobile.locator('.battle-buff-panel[data-buff-team="enemy"]').waitFor();
if (!(await mobile.locator('.dialog-merge-rule').textContent())?.includes('×2')) {
  throw new Error('Mobile merge detail does not show its doubled effect');
}
const mobileBuffDialog = await mobile.locator('.block-dialog').boundingBox();
if (!mobileBuffDialog || mobileBuffDialog.y < 0 || mobileBuffDialog.y + mobileBuffDialog.height > 844) {
  throw new Error(`Mobile buff detail is clipped: ${JSON.stringify(mobileBuffDialog)}`);
}
await mobile.screenshot({ path: '/tmp/code-monsters-circuit-mobile-buff-detail.png', fullPage: true });
await mobile.getByRole('button', { name: '詳細を閉じる' }).click();
await mobile.screenshot({ path: '/tmp/code-monsters-circuit-mobile-battle.png', fullPage: true });

const pulse = await browser.newPage({ viewport: { width: 960, height: 900 }, deviceScaleFactor: 1 });
pulse.on('pageerror', (error) => errors.push(error.message));
pulse.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
await pulse.clock.install();
await pulse.goto(target, { waitUntil: 'networkidle' });
await pulse.getByRole('button', { name: /戦闘開始/ }).click();
await pulse.locator('.battle-screen').waitFor();
if ((await pulse.getByRole('group', { name: '戦闘速度' }).getByRole('button').count()) !== 3) {
  throw new Error('Battle speed controls do not offer 1x, 2x, and 3x');
}
if ((await pulse.getByRole('button', { name: '1倍' }).getAttribute('aria-pressed')) !== 'true') {
  throw new Error('Battle does not start at the readable 1x speed');
}
await pulse.clock.runFor(481);
const firstPulse = await pulse
  .locator('.battle-circuit-summary.team-enemy [data-pulse-step]')
  .evaluateAll((cells) => cells.map((cell) => cell.getAttribute('data-cell-key')).sort());
if (JSON.stringify(firstPulse) !== JSON.stringify(['2:0'])) {
  throw new Error(`First pulse stage is not the source cell: ${JSON.stringify(firstPulse)}`);
}
if (
  (await pulse.locator('.battle-circuit-summary.team-enemy [data-cell-key="2:0"][data-activated="true"]').count()) !== 1
) {
  throw new Error('The source skill did not light when it activated');
}
if ((await pulse.locator('.battle-circuit-summary.team-enemy .block-port.is-conducting').count()) === 0) {
  throw new Error('The first pulse did not animate current on its input edge');
}
if (
  (await pulse.locator('.battle-projectile.team-enemy.effect-damage').count()) === 0 ||
  !(await pulse.locator('.arena-fighter.team-player .combat-feedback').textContent())?.includes('HP')
) {
  throw new Error('Damage did not show its projectile and impact value');
}
await pulse.getByRole('button', { name: '3倍' }).click();
if ((await pulse.locator('.battle-screen').getAttribute('data-battle-speed')) !== '3') {
  throw new Error('Battle speed did not switch to 3x');
}
await pulse.clock.runFor(159);
const pulseBeforeFastFrame = await pulse
  .locator('.battle-circuit-summary.team-enemy [data-pulse-step]')
  .evaluateAll((cells) => cells.map((cell) => cell.getAttribute('data-cell-key')).sort());
if (JSON.stringify(pulseBeforeFastFrame) !== JSON.stringify(['2:0'])) {
  throw new Error('The 3x speed advanced before one scaled frame elapsed');
}
await pulse.clock.runFor(2);
const parallelPulse = await pulse
  .locator('.battle-circuit-summary.team-enemy [data-pulse-step]')
  .evaluateAll((cells) => cells.map((cell) => cell.getAttribute('data-cell-key')).sort());
if (JSON.stringify(parallelPulse) !== JSON.stringify(['1:0', '2:1'])) {
  throw new Error(`Split pulse did not fire the same depth together: ${JSON.stringify(parallelPulse)}`);
}
await pulse.getByRole('button', { name: '1倍' }).click();
await pulse.clock.runFor(480);
await pulse.clock.runFor(480);
await pulse.clock.runFor(480);
const mergingPulse = pulse.locator('.battle-circuit-summary.team-enemy .battle-circuit-cell.is-merging');
if (
  (await mergingPulse.count()) !== 1 ||
  !(await mergingPulse.locator('.block-merge-chip').textContent())?.includes('×2')
) {
  const pulseState = await pulse
    .locator('.battle-circuit-summary.team-enemy [data-pulse-step]')
    .evaluateAll((cells) =>
      cells.map((cell) => ({ key: cell.getAttribute('data-cell-key'), step: cell.getAttribute('data-pulse-step') })),
    );
  throw new Error(`Merged pulse did not arrive last with its doubled-effect marker: ${JSON.stringify(pulseState)}`);
}
await pulse.screenshot({ path: '/tmp/code-monsters-circuit-pulse-merge.png', fullPage: true });
await pulse.clock.runFor(480);
const cooldownSource = pulse.locator('.battle-circuit-summary.team-enemy [data-cell-key="2:0"]');
if (
  (await cooldownSource.getAttribute('data-pulse-step')) !== '1' ||
  (await cooldownSource.getAttribute('data-conducting')) !== 'true' ||
  (await cooldownSource.getAttribute('data-activated')) !== null
) {
  throw new Error('A cooldown skill did not conduct current without lighting as activated');
}

const overload = await browser.newPage({ viewport: { width: 960, height: 900 }, deviceScaleFactor: 1 });
overload.on('pageerror', (error) => errors.push(error.message));
overload.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
await overload.clock.install();
await overload.goto(target, { waitUntil: 'networkidle' });
await overload.getByRole('button', { name: /戦闘開始/ }).click();
await overload.locator('.battle-screen').waitFor();
await overload.getByRole('button', { name: '3倍' }).click();
await advanceClock(overload, 32_005, 160);
await overload.getByText('OVERLOAD', { exact: true }).waitFor();
if ((await overload.locator('.status-overload').count()) !== 2) {
  throw new Error('Overload status is not visible on both fighters');
}
if (!(await overload.locator('.battle-counter').textContent())?.includes('DMG 2')) {
  throw new Error('The first exponential overload pulse is not shown');
}
await overload.screenshot({ path: '/tmp/code-monsters-circuit-overload.png', fullPage: true });

const lockedRun = await browser.newPage({ viewport: { width: 960, height: 900 }, deviceScaleFactor: 1 });
lockedRun.on('pageerror', (error) => errors.push(error.message));
lockedRun.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
await lockedRun.clock.install();
await lockedRun.goto(target, { waitUntil: 'networkidle' });
const coinsBeforeLoss = Number((await lockedRun.locator('.coin-readout b').textContent())?.trim());
const lockedAcrossRun = lockedRun.locator('.shop-card').last();
const lockedAcrossRunTitle = (await lockedAcrossRun.locator('.shop-block-button strong').textContent())?.trim();
await lockedAcrossRun.locator('.lock-button').click();
await lockedRun.getByRole('button', { name: /戦闘開始/ }).click();
await lockedRun.locator('.battle-screen').waitFor();
await lockedRun.getByRole('button', { name: '3倍' }).click();
await advanceClock(lockedRun, 50_000, 160);
await lockedRun.locator('.result-panel').waitFor();
if (!(await lockedRun.locator('.result-reward').textContent())?.includes('COIN +2')) {
  throw new Error('Defeat result does not show its coin reward');
}
await lockedRun.screenshot({ path: '/tmp/code-monsters-circuit-loss-reward.png', fullPage: true });
await lockedRun.getByRole('button', { name: '工房へ戻る' }).click();
const coinsAfterLoss = Number((await lockedRun.locator('.coin-readout b').textContent())?.trim());
const retainedAcrossRun = lockedRun.locator('.shop-card').last();
if (coinsAfterLoss !== coinsBeforeLoss + 2) {
  throw new Error(`Defeat reward was not granted: ${coinsBeforeLoss} -> ${coinsAfterLoss}`);
}
if (
  (await retainedAcrossRun.locator('.shop-block-button strong').textContent())?.trim() !== lockedAcrossRunTitle ||
  (await retainedAcrossRun.locator('.lock-button').getAttribute('aria-pressed')) !== 'true'
) {
  throw new Error('Locked offer was not retained after returning from battle');
}
if (errors.length > 0) throw new Error(`Browser errors:\n${errors.join('\n')}`);

console.log(
  JSON.stringify(
    {
      target,
      checks: { ...checks, fighters },
      horizontalOverflow,
      screenshots: [
        'desktop',
        'battle',
        'buff-detail',
        'mobile',
        'mobile-battle',
        'mobile-buff-detail',
        'pulse-merge',
        'overload',
        'loss-reward',
      ],
    },
    null,
    2,
  ),
);
await browser.close();
