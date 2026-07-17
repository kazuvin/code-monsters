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
  const formation = await page.locator('.sprite').evaluateAll((elements) =>
    elements.map((element) => ({
      team: element.classList.contains('ally') ? 'ally' : 'enemy',
      lane: Number.parseInt(element.getAttribute('data-lane-index') ?? '-1', 10),
      laneOffset: Number.parseFloat(getComputedStyle(element).getPropertyValue('--lane-offset')),
      zIndex: Number.parseInt(getComputedStyle(element).zIndex, 10),
    })),
  );
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
    formation,
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

for (const result of results) {
  if (result.spriteCount !== 6 || result.statusCards !== 6)
    throw new Error(`${result.viewport}: デフォルト戦闘が3対3ではありません`);
  for (const team of ['ally', 'enemy']) {
    const formation = result.formation.filter((fighter) => fighter.team === team).sort((a, b) => a.lane - b.lane);
    if (
      formation.length !== 3 ||
      formation.some((fighter, index) => fighter.lane !== index || fighter.laneOffset !== index * 22)
    )
      throw new Error(`${result.viewport}: ${team}が3レーンに配置されていません`);
    if (!(formation[0].zIndex > formation[1].zIndex && formation[1].zIndex > formation[2].zIndex))
      throw new Error(`${result.viewport}: 手前の${team}が最前面に描画されていません`);
  }
  if (result.buildOverflow > 0 || result.battleOverflow > 0)
    throw new Error(`${result.viewport}: 画面が横にはみ出しています`);
  if (result.errors.length > 0) throw new Error(`${result.viewport}: ブラウザエラー: ${result.errors.join(', ')}`);
}
