import { chromium } from 'playwright-core';

const target = process.argv.slice(2).find((argument) => argument !== '--') ?? 'http://127.0.0.1:5173';
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});

const errors = [];
const desktop = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
desktop.on('pageerror', (error) => errors.push(error.message));
desktop.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});

await desktop.goto(target, { waitUntil: 'networkidle' });
await desktop.getByRole('heading', { name: 'CODE MONSTERS' }).waitFor();

const checks = {
  programCells: await desktop.locator('.program-cell').count(),
  shopSlots: await desktop.locator('.shop-card, .shop-empty').count(),
};

if (checks.programCells !== 12) throw new Error(`Expected 12 program cells, found ${checks.programCells}`);
if (checks.shopSlots !== 5) throw new Error(`Expected 5 shop slots, found ${checks.shopSlots}`);
if ((await desktop.locator('.battle-screen').count()) !== 0)
  throw new Error('Battle screen is visible during build phase');

const firstCell = desktop.locator('.program-cell').nth(0);
const secondCell = desktop.locator('.program-cell').nth(1);
const firstCommand = (await firstCell.locator('strong').textContent())?.trim();
const secondCommand = (await secondCell.locator('strong').textContent())?.trim();
await firstCell.click();
await secondCell.click();
if (
  !(await firstCell.textContent())?.includes(secondCommand) ||
  !(await secondCell.textContent())?.includes(firstCommand)
) {
  throw new Error('Could not swap two programmed commands');
}

const firstOffer = desktop.locator('.shop-card').first();
const purchasedTitle = (await firstOffer.locator('strong').textContent())?.trim();
if (!purchasedTitle) throw new Error('Could not read the first shop offer');
await firstOffer.getByRole('button', { name: /買う/ }).click();
await desktop.waitForFunction(
  (title) =>
    [...document.querySelectorAll('.rack-chip')].some(
      (chip) => chip.textContent?.includes(title) && !(chip instanceof HTMLButtonElement && chip.disabled),
    ),
  purchasedTitle,
);
const destinationIndex = await desktop
  .locator('.program-cell')
  .evaluateAll((cells, title) => cells.findIndex((cell) => !cell.textContent?.includes(title)), purchasedTitle);
if (destinationIndex < 0) throw new Error(`Could not find a destination for ${purchasedTitle}`);
const destination = desktop.locator('.program-cell').nth(destinationIndex);
await destination.click();
await desktop.locator('.rack-chip').filter({ hasText: purchasedTitle }).click();
if (!(await destination.textContent())?.includes(purchasedTitle)) {
  throw new Error(`Could not equip purchased command ${purchasedTitle}`);
}

await desktop.screenshot({ path: '/tmp/code-monsters-new-desktop.png', fullPage: true });
await desktop.getByRole('button', { name: /戦闘開始/ }).click();
await desktop.locator('.battle-screen').waitFor();
const fighters = await desktop.locator('.arena-fighter').count();
if (fighters !== 6) throw new Error(`Expected 6 arena fighters, found ${fighters}`);
if ((await desktop.locator('.workspace-layout').count()) !== 0)
  throw new Error('Build screen remained visible in battle');
await desktop.waitForTimeout(700);
await desktop.screenshot({ path: '/tmp/code-monsters-new-battle.png', fullPage: true });
await desktop.getByRole('dialog').waitFor({ timeout: 20_000 });
await desktop.getByRole('button', { name: '工房へ戻る' }).click();
await desktop.getByText('RUN 02').waitFor();

const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
mobile.on('pageerror', (error) => errors.push(error.message));
mobile.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
await mobile.goto(target, { waitUntil: 'networkidle' });
const mobileCellBounds = await mobile.locator('.program-cell').evaluateAll((cells) =>
  cells.map((cell) => {
    const box = cell.getBoundingClientRect();
    return { left: box.left, right: box.right };
  }),
);
if (mobileCellBounds.some((box) => box.left < 0 || box.right > 390)) {
  throw new Error(`Mobile program board is clipped: ${JSON.stringify(mobileCellBounds)}`);
}
const mobileFirstCell = mobile.locator('.program-cell').nth(0);
const mobileSecondCell = mobile.locator('.program-cell').nth(1);
const mobileFirstCommand = (await mobileFirstCell.locator('strong').textContent())?.trim();
const mobileSecondCommand = (await mobileSecondCell.locator('strong').textContent())?.trim();
await mobileFirstCell.click();
await mobileSecondCell.click();
if (
  !(await mobileFirstCell.textContent())?.includes(mobileSecondCommand) ||
  !(await mobileSecondCell.textContent())?.includes(mobileFirstCommand)
) {
  throw new Error('Could not swap programmed commands on mobile');
}
const rerollButton = mobile.getByRole('button', { name: 'ショップを更新' });
await rerollButton.scrollIntoViewIfNeeded();
if (!(await rerollButton.isVisible())) throw new Error('Mobile reroll button is not visible');
await rerollButton.click();
await mobile.getByText('ショップを更新').last().waitFor();
await mobile.screenshot({ path: '/tmp/code-monsters-new-mobile.png', fullPage: true });

const horizontalOverflow = await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
if (horizontalOverflow > 1) throw new Error(`Mobile page overflows horizontally by ${horizontalOverflow}px`);
await mobile.getByRole('button', { name: /戦闘開始/ }).click();
await mobile.locator('.battle-screen').waitFor();
await mobile.waitForTimeout(700);
await mobile.screenshot({ path: '/tmp/code-monsters-new-mobile-battle.png', fullPage: true });
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
