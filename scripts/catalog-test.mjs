import fs from 'node:fs';
import { chromium } from 'playwright-core';

const targetUrl = process.argv[2] ?? 'http://127.0.0.1:5173/';
const data = JSON.parse(fs.readFileSync(new URL('../game-data/game-balance.json', import.meta.url), 'utf8'));
const browser = await chromium.launch({
  headless: true,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--use-angle=swiftshader'],
});

const results = [];
for (const viewport of [
  { name: 'desktop', width: 1440, height: 900, deviceScaleFactor: 1 },
  { name: 'mobile', width: 390, height: 844, deviceScaleFactor: 3 },
]) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: viewport.deviceScaleFactor });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(targetUrl, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'カタログ' }).click();
  await page.waitForSelector('.catalog-page');

  const counts = {
    units: await page.locator('.catalog-unit-card').count(),
    conditions: await page.locator('.catalog-rule-card').count(),
    targets: await page.locator('.catalog-target-card').count(),
    instructions: await page.locator('.catalog-skill-card').count(),
  };
  const economyText = (await page.locator('.catalog-economy').innerText()).replace(/\s+/g, ' ').trim();
  const skillRulerCells = await page.locator('.catalog-skill-card .catalog-cost-ruler i').count();
  const impactRingFilled = await page
    .locator('.catalog-skill-card[data-catalog-id="impact-ring"] .catalog-cost-ruler i.filled')
    .count();
  const berserkerFilled = await page
    .locator('.catalog-skill-card[data-catalog-id="berserker-mode"] .catalog-cost-ruler i.filled')
    .count();
  const skillCopy = await page.locator('#skills').innerText();
  const toxinRules = (await page.locator('[data-catalog-id="toxin-orb"]').innerText()).replace(/\s+/g, ' ').trim();
  const seekerRules = (await page.locator('[data-catalog-id="seeker-orb"]').innerText()).replace(/\s+/g, ' ').trim();
  const counterRules = (await page.locator('[data-catalog-id="counter-orb"]').innerText()).replace(/\s+/g, ' ').trim();
  const pulseRules = (await page.locator('[data-catalog-id="pulse-bolt"]').innerText()).replace(/\s+/g, ' ').trim();
  const diveRules = (await page.locator('[data-catalog-id="dive-strike"]').innerText()).replace(/\s+/g, ' ').trim();
  const hasEquipmentCopy = (await page.locator('.catalog-page').innerText()).includes('装備');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  await page.screenshot({
    path: `/tmp/code-monsters-${viewport.name}-catalog.png`,
    fullPage: viewport.name === 'desktop',
  });
  if (viewport.name === 'mobile') {
    await page.locator('#skills').scrollIntoViewIfNeeded();
    await page.screenshot({ path: '/tmp/code-monsters-mobile-catalog-skills.png' });
  }

  await page.getByRole('button', { name: new RegExp(`スキル ${data.instructions.length}`) }).click();
  await page.getByRole('searchbox', { name: 'カタログを検索' }).fill('自己修復');
  const searchResult = {
    instructions: await page.locator('.catalog-skill-card').count(),
    text: (await page.locator('.catalog-content').innerText()).replace(/\s+/g, ' ').trim(),
    visibleCount: await page.locator('.catalog-controls output').textContent(),
  };

  results.push({
    viewport: viewport.name,
    counts,
    economyText,
    skillRulerCells,
    impactRingFilled,
    berserkerFilled,
    hasTargetSlotCopy: skillCopy.includes('対象スロット'),
    toxinRules,
    seekerRules,
    counterRules,
    pulseRules,
    diveRules,
    hasEquipmentCopy,
    overflow,
    searchResult,
    errors,
  });
  await page.close();
}
await browser.close();

console.log(JSON.stringify(results, null, 2));

for (const result of results) {
  if (
    result.counts.units !== data.units.length ||
    result.counts.conditions !== data.conditions.length ||
    result.counts.targets !== data.targetSelectors.length ||
    result.counts.instructions !== data.instructions.length
  )
    throw new Error(`${result.viewport}: 全ゲームデータがカタログに表示されていません`);
  if (!result.economyText.includes('8 / 10') || !result.economyText.includes('+1.5 / SEC'))
    throw new Error(`${result.viewport}: COST経済の要約がデータ定義と一致しません`);
  if (result.skillRulerCells !== data.instructions.length * data.battle.abilityGaugeMax)
    throw new Error(`${result.viewport}: スキルの10目盛りCOSTルーラーが不正です`);
  if (result.impactRingFilled !== 4 || result.berserkerFilled !== 3)
    throw new Error(`${result.viewport}: スキルコストがルーラーへ反映されていません`);
  if (result.hasTargetSlotCopy) throw new Error(`${result.viewport}: 1vs1で不要な対象スロット表記が残っています`);
  if (!result.toxinRules.includes('直進弾 / 速度17') || !result.toxinRules.includes('ATK×0.38'))
    throw new Error(`${result.viewport}: 毒弾の直進設定がカタログへ反映されていません`);
  if (!result.seekerRules.includes('追尾弾') || !result.seekerRules.includes('ATK×0.42'))
    throw new Error(`${result.viewport}: シーカーオーブの弱体化がカタログへ反映されていません`);
  if (!result.counterRules.includes('追尾弾') || !result.counterRules.includes('ATK×0.28'))
    throw new Error(`${result.viewport}: カウンターオーブの弱体化がカタログへ反映されていません`);
  if (!result.pulseRules.includes('有効化距離 8m'))
    throw new Error(`${result.viewport}: 遠距離弾の近接安全距離がカタログへ反映されていません`);
  if (!result.diveRules.includes('着地攻撃') || !result.diveRules.includes('必要高度 8m'))
    throw new Error(`${result.viewport}: 降下強襲の着地条件がカタログへ反映されていません`);
  if (result.hasEquipmentCopy) throw new Error(`${result.viewport}: 廃止した装備表記がカタログへ残っています`);
  if (
    result.searchResult.instructions !== 1 ||
    !result.searchResult.text.includes('自己修復する') ||
    result.searchResult.visibleCount !== '1件を表示'
  )
    throw new Error(`${result.viewport}: スキル検索の結果が不正です`);
  if (result.overflow > 0) throw new Error(`${result.viewport}: カタログが横にはみ出しています`);
  if (result.errors.length > 0) throw new Error(`${result.viewport}: ブラウザエラー: ${result.errors.join(', ')}`);
}
