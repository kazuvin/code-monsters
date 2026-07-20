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
  const targetSlotCount = await page.locator('.target-word-slot').count();
  const buildCopy = await page.locator('.view-game.phase-build').innerText();
  await page.screenshot({ path: `/tmp/code-monsters-${viewport.name}-build.png`, fullPage: true });
  await page.getByRole('button', { name: /戦闘開始/ }).click();
  await page.waitForSelector('.side-battlefield');
  await page.waitForTimeout(2400);
  const battlefieldCount = await page.locator('.side-battlefield').count();
  const verticalDisplayRange = Number.parseFloat(
    (await page.locator('.side-battlefield').getAttribute('data-vertical-display-range')) ?? '0',
  );
  const spriteCount = await page.locator('.sprite').count();
  const formation = await page.locator('.sprite').evaluateAll((elements) =>
    elements.map((element) => ({
      team: element.classList.contains('ally') ? 'ally' : 'enemy',
      depthSlot: Number.parseInt(element.getAttribute('data-depth-slot') ?? '-1', 10),
      depthOffset: Number.parseFloat(getComputedStyle(element).getPropertyValue('--depth-offset')),
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
  const actionReadoutCount = await page.locator('.battle-action-readout').count();
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
    targetSlotCount,
    hasRedundantTargetCopy: buildCopy.includes('対象スロット') || buildCopy.includes('このユニットから見て'),
    battleOverflow,
    battlefieldCount,
    verticalDisplayRange,
    spriteCount,
    formation,
    battlefield,
    statusCards,
    actionBubbleCount,
    actionReadoutCount,
    logs,
    logDialogCount,
    errors,
  });
  await page.close();
}
await browser.close();
console.log(JSON.stringify(results, null, 2));

for (const result of results) {
  if (result.spriteCount !== 2 || result.statusCards !== 2)
    throw new Error(`${result.viewport}: デフォルト戦闘が1対1ではありません`);
  if (result.verticalDisplayRange !== 62)
    throw new Error(`${result.viewport}: 論理Y座標が戦場高へ正規化されていません`);
  for (const team of ['ally', 'enemy']) {
    const formation = result.formation.filter((fighter) => fighter.team === team);
    if (formation.length !== 1 || formation[0].depthSlot !== 0 || formation[0].depthOffset !== 0)
      throw new Error(`${result.viewport}: ${team}のデュエリストが中央戦線に配置されていません`);
  }
  if (result.actionReadoutCount !== 1 || result.actionBubbleCount !== 0)
    throw new Error(`${result.viewport}: 実行者・技・対象の表示が一意ではありません`);
  if (result.targetSlotCount !== 0 || result.hasRedundantTargetCopy)
    throw new Error(`${result.viewport}: 1vs1で不要な対象選択UIが残っています`);
  if (result.buildOverflow > 0 || result.battleOverflow > 0)
    throw new Error(`${result.viewport}: 画面が横にはみ出しています`);
  if (result.errors.length > 0) throw new Error(`${result.viewport}: ブラウザエラー: ${result.errors.join(', ')}`);
}
