import { chromium } from 'playwright-core';

const targetUrl = process.argv[2] ?? 'http://127.0.0.1:5173/';
const browser = await chromium.launch({
  headless: true,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--use-angle=swiftshader'],
});

const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await page.goto(targetUrl, { waitUntil: 'networkidle' });

const fieldRepairCard = page.locator('.instruction-shop-item').filter({ hasText: 'ヒールする' }).first();
const fieldRepairShopText = (await fieldRepairCard.innerText()).replace(/\s+/g, ' ').trim();
const healingCardCount = await page
  .locator('.instruction-shop-item')
  .filter({ hasText: /ヒールする|修復する/ })
  .count();

const program = page.locator('.workbench > .program-list').first();
const initialTargetSlot = program.locator('.sentence-block').first().locator('.target-word-slot');
const targetMarkerContent = await initialTargetSlot.evaluate(
  (element) => getComputedStyle(element, '::before').content,
);
await initialTargetSlot.click();
const initialTargetChoices = (await page.locator('.choice-list .target-choice-card').allInnerTexts()).map((text) =>
  text.replace(/\s+/g, ' ').trim(),
);
await page.locator('.target-choice-card').filter({ hasText: '一番近い味方' }).click();
await page.locator('.condition-choice-card').filter({ hasText: '射程範囲外' }).click();
const allyWithoutHealProgram = (await program.innerText()).replace(/\s+/g, ' ').trim();

await fieldRepairCard.getByRole('button', { name: /購入/ }).click();

await program.locator('.add-block').click();
const repairRow = program.locator('.sentence-block').last();
const targetChoices = (await page.locator('.choice-list .target-choice-card').allInnerTexts()).map((text) =>
  text.replace(/\s+/g, ' ').trim(),
);
const targetEffectBoxCount = await page.locator('.choice-list .target-choice-card .condition-effect').count();

await page.locator('.target-choice-card').filter({ hasText: 'HPが最も低い味方' }).click();
const conditionChoices = (await page.locator('.choice-list .condition-choice-card').allInnerTexts()).map((text) =>
  text.replace(/\s+/g, ' ').trim(),
);
await page.locator('.condition-choice-card').filter({ hasText: '射程範囲内' }).click();
await repairRow.locator('.word-slot').last().click();
const allyActionChoices = (await page.locator('.choice-list .instruction-choice-card').allInnerTexts()).map((text) =>
  text.replace(/\s+/g, ' ').trim(),
);
await page.locator('.instruction-choice-card').filter({ hasText: 'ヒールする' }).click();
const configuredRepairRow = program.locator('.sentence-block').filter({ hasText: 'ヒールする' });
await configuredRepairRow.getByRole('button', { name: '上へ移動' }).click();
await configuredRepairRow.getByRole('button', { name: '上へ移動' }).click();
const configuredProgram = (await program.innerText()).replace(/\s+/g, ' ').trim();
await configuredRepairRow.locator('.word-slot').first().click();
await page.screenshot({ path: '/tmp/code-monsters-healing-targets.png', fullPage: true });

await page.getByRole('button', { name: /戦闘開始/ }).click();
await page.getByRole('button', { name: 'x2' }).click();

let healSeen = false;
let healedTarget = '';
for (let tick = 0; tick < 1400; tick += 1) {
  const healingTarget = page.locator('.sprite.ally.is-heal').first();
  if ((await healingTarget.count()) > 0) {
    healSeen = true;
    healedTarget = (await healingTarget.textContent())?.replace(/\s+/g, ' ').trim() ?? '';
    await page.screenshot({ path: '/tmp/code-monsters-healing.png', fullPage: true });
    break;
  }
  await page.waitForTimeout(30);
}

await page.locator('.battle-controls button').first().click();
await page.getByRole('button', { name: /^ログ/ }).click();
const healLog = (
  await page
    .locator('.log.heal')
    .filter({ hasText: '修復' })
    .first()
    .innerText()
    .catch(() => '')
)
  .replace(/\s+/g, ' ')
  .trim();
await browser.close();

console.log(
  JSON.stringify(
    {
      fieldRepairShopText,
      healingCardCount,
      initialTargetChoices,
      allyWithoutHealProgram,
      targetMarkerContent,
      targetChoices,
      targetEffectBoxCount,
      conditionChoices,
      allyActionChoices,
      configuredProgram,
      healSeen,
      healedTarget,
      healLog,
      errors,
    },
    null,
    2,
  ),
);

if (!fieldRepairShopText.includes('COMMON / REPAIR') || !fieldRepairShopText.includes('回復 22 HP'))
  throw new Error('ヒールのショップ表示が不正です');
if (healingCardCount !== 1) throw new Error('回復スキルが複数ショップに残っています');
for (const target of ['一番近い味方', 'HPが最も低い味方', 'HP 30%以下の味方']) {
  if (!initialTargetChoices.some((choice) => choice.includes(target)))
    throw new Error(`ヒール購入前に${target}を選べません`);
}
if (!allyWithoutHealProgram.startsWith('1 もし このユニットから見て 一番近い味方 が 射程範囲外 なら 前進する'))
  throw new Error('味方対象を選んだときに所持済みの互換行動へ切り替わりません');
if (targetMarkerContent !== 'none') throw new Error('対象スロットに点の装飾が残っています');
for (const target of ['一番近い味方', 'HPが最も低い味方', 'HP 30%以下の味方']) {
  if (!targetChoices.some((choice) => choice.includes(target))) throw new Error(`${target}が回復対象にありません`);
}
if (targetChoices.length !== 5) throw new Error('所持行動で利用できない対象候補が表示されています');
if (targetEffectBoxCount !== 0) throw new Error('対象カードに重複した対象ボックスが残っています');
if (
  conditionChoices.length !== 2 ||
  !conditionChoices.some((choice) => choice.includes('射程範囲内')) ||
  !conditionChoices.some((choice) => choice.includes('射程範囲外')) ||
  conditionChoices.some((choice) => choice.includes('いつでも'))
)
  throw new Error('味方対象の条件が射程範囲内・外に限定されていません');
if (
  !allyActionChoices.some((choice) => choice.includes('ヒールする')) ||
  !allyActionChoices.some((choice) => choice.includes('前進する')) ||
  allyActionChoices.some((choice) => choice.includes('通常攻撃'))
)
  throw new Error('味方対象に応じた回復アクションの絞り込みが不正です');
if (!configuredProgram.startsWith('1 もし このユニットから見て HPが最も低い味方 が 射程範囲内 なら ヒールする'))
  throw new Error('ヒールを行動ユニット視点の通常作戦として設定できません');
if (!healSeen || !healedTarget.includes('バスティオン')) throw new Error('戦闘中に対象味方への回復を確認できません');
if (!healLog.includes('ヴォルト') || !healLog.includes('バスティオンを 22 修復'))
  throw new Error('ヒールが戦闘ログに記録されていません');
if (errors.length > 0) throw new Error(`ブラウザエラー: ${errors.join(', ')}`);
