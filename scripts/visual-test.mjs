import { chromium } from 'playwright-core';

const browser = await chromium.launch({
  headless: true,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--use-angle=swiftshader'],
});

const targetUrl = process.argv[2] ?? 'http://127.0.0.1:5173/';
const results = [];
for (const viewport of [
  { name: 'desktop', width: 1440, height: 900, deviceScaleFactor: 1 },
  { name: 'mobile', width: 390, height: 844, deviceScaleFactor: 3 },
]) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: viewport.deviceScaleFactor });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(targetUrl, { waitUntil: 'networkidle' });
  const buildOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  await page.screenshot({ path: `/tmp/code-monsters-${viewport.name}-build.png`, fullPage: true });
  await page.getByRole('button', { name: /戦闘開始/ }).click();
  await page.waitForSelector('.side-battlefield');
  await page.waitForTimeout(2400);
  const battlefieldCount = await page.locator('.side-battlefield').count();
  const spriteCount = await page.locator('.sprite').count();
  const battlefield = await page
    .locator('.side-battlefield')
    .first()
    .evaluate((element) => {
      const fieldRect = element.getBoundingClientRect();
      const arenaRect = element.closest('.arena')?.getBoundingClientRect();
      return {
        cssWidth: Math.round(fieldRect.width),
        cssHeight: Math.round(fieldRect.height),
        arenaWidth: Math.round(arenaRect?.width ?? 0),
        arenaHeight: Math.round(arenaRect?.height ?? 0),
      };
    });
  const statusCards = await page.locator('.unit-status-card').count();
  const actionBubbleCount = await page.locator('.card-action-bubble').count();
  const battleOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  await page.screenshot({ path: `/tmp/code-monsters-${viewport.name}-battle.png`, fullPage: true });
  await page.getByRole('button', { name: /^ログ/ }).click();
  const logs = await page.locator('.log-dialog .log').count();
  const logDialogCount = await page.locator('.log-dialog').count();
  results.push({
    viewport: viewport.name,
    deviceScaleFactor: viewport.deviceScaleFactor,
    buildOverflow,
    battleOverflow,
    battlefieldCount,
    spriteCount,
    battlefield,
    statusCards,
    actionBubbleCount,
    logs,
    logDialogCount,
    errors,
  });
  await page.close();
}
await browser.close();
console.log(JSON.stringify(results, null, 2));
