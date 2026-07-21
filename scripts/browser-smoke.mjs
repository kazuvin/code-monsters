import { chromium } from 'playwright-core';

const target = process.argv.slice(2).find((argument) => argument !== '--') ?? 'http://127.0.0.1:5173';
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

const detailBlock = desktop.locator('[data-row="2"][data-column="1"] .block-button');
await detailBlock.click();
await desktop.getByRole('dialog', { name: '斬撃' }).waitFor();
await desktop.getByRole('button', { name: '詳細を閉じる' }).click();

const firstCell = desktop.locator('[data-row="2"][data-column="1"]');
const secondCell = desktop.locator('[data-row="2"][data-column="3"]');
const firstGlyph = (await firstCell.locator('.block-core b').textContent())?.trim();
const secondGlyph = (await secondCell.locator('.block-core b').textContent())?.trim();
await longDrag(desktop, firstCell.locator('.block-button'), secondCell);
if (
  (await firstCell.locator('.block-core b').textContent())?.trim() !== secondGlyph ||
  (await secondCell.locator('.block-core b').textContent())?.trim() !== firstGlyph
) {
  throw new Error('Could not swap circuit blocks with long-press drag');
}

const rackBlock = desktop.locator('.rack-block').first();
const rackGlyph = (await rackBlock.locator('.block-core b').textContent())?.trim();
const emptyCell = desktop.locator('[data-row="0"][data-column="0"]');
await longDrag(desktop, rackBlock, emptyCell);
if ((await emptyCell.locator('.block-core b').textContent())?.trim() !== rackGlyph) {
  throw new Error('Could not place a rack block with long-press drag');
}

await emptyCell.locator('.block-button').click();
await desktop.getByRole('dialog').waitFor();
const portsBefore = await desktop
  .locator('.dialog-block-preview .block-port')
  .evaluateAll((ports) => ports.map((port) => port.className).sort());
await desktop.getByRole('button', { name: /回す/ }).click();
const portsAfter = await desktop
  .locator('.dialog-block-preview .block-port')
  .evaluateAll((ports) => ports.map((port) => port.className).sort());
if (JSON.stringify(portsBefore) === JSON.stringify(portsAfter))
  throw new Error('Block rotation did not change its ports');
await desktop.getByRole('button', { name: '詳細を閉じる' }).click();

const firstOffer = desktop.locator('.shop-card').first();
const coinsBefore = Number((await desktop.locator('.coin-readout b').textContent())?.trim());
await firstOffer.getByRole('button', { name: /買う/ }).click();
const coinsAfter = Number((await desktop.locator('.coin-readout b').textContent())?.trim());
if (!(coinsAfter < coinsBefore)) throw new Error('Buying a block did not spend coins');
if ((await desktop.locator('.shop-card').count()) !== 4) throw new Error('Purchased shop block was not removed');

await desktop.screenshot({ path: '/tmp/code-monsters-circuit-desktop.png', fullPage: true });
await desktop.getByRole('button', { name: /戦闘開始/ }).click();
await desktop.locator('.battle-screen').waitFor();
const fighters = await desktop.locator('.arena-fighter').count();
if (fighters !== 2) throw new Error(`Expected 2 arena fighters, found ${fighters}`);
if ((await desktop.locator('.workspace-layout').count()) !== 0)
  throw new Error('Build screen remained visible in battle');
await desktop.waitForTimeout(900);
await desktop.screenshot({ path: '/tmp/code-monsters-circuit-battle.png', fullPage: true });
await desktop.getByRole('dialog').waitFor({ timeout: 20_000 });
await desktop.getByRole('button', { name: '工房へ戻る' }).click();
await desktop.getByText('RUN 02').waitFor();

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

const mobileFirst = mobile.locator('[data-row="2"][data-column="1"]');
const mobileSecond = mobile.locator('[data-row="2"][data-column="3"]');
const mobileFirstGlyph = (await mobileFirst.locator('.block-core b').textContent())?.trim();
const mobileSecondGlyph = (await mobileSecond.locator('.block-core b').textContent())?.trim();
await longTouch(mobile, mobileClient, mobileFirst.locator('.block-button'), mobileSecond);
if (
  (await mobileFirst.locator('.block-core b').textContent())?.trim() !== mobileSecondGlyph ||
  (await mobileSecond.locator('.block-core b').textContent())?.trim() !== mobileFirstGlyph
) {
  throw new Error('Could not swap circuit blocks on mobile viewport');
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
await mobile.screenshot({ path: '/tmp/code-monsters-circuit-mobile-battle.png', fullPage: true });
if (errors.length > 0) throw new Error(`Browser errors:\n${errors.join('\n')}`);

console.log(
  JSON.stringify(
    {
      target,
      checks: { ...checks, fighters },
      horizontalOverflow,
      screenshots: ['desktop', 'battle', 'mobile', 'mobile-battle'],
    },
    null,
    2,
  ),
);
await browser.close();
