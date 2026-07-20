import { chromium } from 'playwright-core';

const target = process.argv[2] ?? 'http://127.0.0.1:5173';
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
  fighters: await desktop.locator('.fighter-line').count(),
  programCells: await desktop.locator('.program-cell').count(),
  shopSlots: await desktop.locator('.shop-card, .shop-empty').count(),
};

if (checks.fighters !== 6) throw new Error(`Expected 6 fighters, found ${checks.fighters}`);
if (checks.programCells !== 12) throw new Error(`Expected 12 program cells, found ${checks.programCells}`);
if (checks.shopSlots !== 5) throw new Error(`Expected 5 shop slots, found ${checks.shopSlots}`);

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
await desktop.getByRole('button', { name: /プログラム実行/ }).click();
await desktop.getByRole('dialog').waitFor({ timeout: 20_000 });
await desktop.getByRole('button', { name: '工房へ戻る' }).click();
await desktop.getByText('RUN 02').waitFor();

const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
mobile.on('pageerror', (error) => errors.push(error.message));
mobile.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
await mobile.goto(target, { waitUntil: 'networkidle' });
await mobile.screenshot({ path: '/tmp/code-monsters-new-mobile.png', fullPage: true });

const horizontalOverflow = await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
if (horizontalOverflow > 1) throw new Error(`Mobile page overflows horizontally by ${horizontalOverflow}px`);
if (errors.length > 0) throw new Error(`Browser errors:\n${errors.join('\n')}`);

console.log(JSON.stringify({ target, checks, horizontalOverflow, screenshots: ['desktop', 'mobile'] }, null, 2));
await browser.close();
