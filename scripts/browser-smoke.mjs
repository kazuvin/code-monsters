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
} else if ((await desktop.getByText('向き固定', { exact: true }).count()) !== 1) {
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
await desktop.waitForTimeout(900);
if ((await desktop.locator('.battle-circuit-cell.is-firing').count()) === 0) {
  throw new Error('Circuit summary did not show a firing skill');
}
const enemyBuffedSkill = desktop.locator(
  '.battle-circuit-summary.team-enemy .battle-circuit-skill:has(.block-buff-chip)',
);
await enemyBuffedSkill.first().waitFor({ timeout: 5000 });
await enemyBuffedSkill.first().click();
await desktop.locator('.battle-buff-panel[data-buff-team="enemy"]').waitFor();
if (
  !(await desktop.getByText('毒の付与量', { exact: true }).count()) ||
  !(await desktop.locator('.battle-buff-values b').textContent())?.includes('+')
) {
  throw new Error('Enemy skill detail does not name its improved stat and amount');
}
if (!(await desktop.getByText('相手の技', { exact: true }).count())) {
  throw new Error('Enemy skill detail does not identify its owner');
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
await mobile.waitForTimeout(900);
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
if ((await mobile.locator('.battle-circuit-cell.is-firing').count()) === 0) {
  throw new Error('Mobile circuit summary did not show a firing skill');
}
const mobileBuffedSkill = mobile.locator(
  '.battle-circuit-summary.team-enemy .battle-circuit-skill:has(.block-buff-chip)',
);
await mobileBuffedSkill.first().waitFor({ timeout: 5000 });
await mobileBuffedSkill.first().click();
await mobile.locator('.battle-buff-panel[data-buff-team="enemy"]').waitFor();
const mobileBuffDialog = await mobile.locator('.block-dialog').boundingBox();
if (!mobileBuffDialog || mobileBuffDialog.y < 0 || mobileBuffDialog.y + mobileBuffDialog.height > 844) {
  throw new Error(`Mobile buff detail is clipped: ${JSON.stringify(mobileBuffDialog)}`);
}
await mobile.screenshot({ path: '/tmp/code-monsters-circuit-mobile-buff-detail.png', fullPage: true });
await mobile.getByRole('button', { name: '詳細を閉じる' }).click();
await mobile.screenshot({ path: '/tmp/code-monsters-circuit-mobile-battle.png', fullPage: true });

const overload = await browser.newPage({ viewport: { width: 960, height: 900 }, deviceScaleFactor: 1 });
overload.on('pageerror', (error) => errors.push(error.message));
overload.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
await overload.clock.install();
await overload.goto(target, { waitUntil: 'networkidle' });
await overload.getByRole('button', { name: /戦闘開始/ }).click();
await overload.locator('.battle-screen').waitFor();
await overload.clock.runFor(20_050);
await overload.getByText('OVERLOAD', { exact: true }).waitFor();
if ((await overload.locator('.status-overload').count()) !== 2) {
  throw new Error('Overload status is not visible on both fighters');
}
if (!(await overload.locator('.battle-counter').textContent())?.includes('DMG 2')) {
  throw new Error('The first exponential overload pulse is not shown');
}
await overload.screenshot({ path: '/tmp/code-monsters-circuit-overload.png', fullPage: true });
if (errors.length > 0) throw new Error(`Browser errors:\n${errors.join('\n')}`);

console.log(
  JSON.stringify(
    {
      target,
      checks: { ...checks, fighters },
      horizontalOverflow,
      screenshots: ['desktop', 'battle', 'buff-detail', 'mobile', 'mobile-battle', 'mobile-buff-detail', 'overload'],
    },
    null,
    2,
  ),
);
await browser.close();
