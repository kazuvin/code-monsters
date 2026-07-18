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

const healingCardCount = await page
  .locator('.instruction-shop-item')
  .filter({ hasText: /ヒールする|修復する/ })
  .count();

const program = page.locator('.workbench > .program-list').first();
const repairRow = program.locator('.sentence-block').filter({ hasText: '通常攻撃' });
const initialTargetSlot = repairRow.locator('.target-word-slot');
const targetMarkerContent = await initialTargetSlot.evaluate(
  (element) => getComputedStyle(element, '::before').content,
);
await initialTargetSlot.click();
const initialTargetChoices = (await page.locator('.choice-list .target-choice-card').allInnerTexts()).map((text) =>
  text.replace(/\s+/g, ' ').trim(),
);
const targetEffectBoxCount = await page.locator('.choice-list .target-choice-card .condition-effect').count();

await page.locator('.target-choice-card').filter({ hasText: '相棒' }).click();
const conditionChoices = (await page.locator('.choice-list .condition-choice-card').allInnerTexts()).map((text) =>
  text.replace(/\s+/g, ' ').trim(),
);
await page.locator('.condition-choice-card').filter({ hasText: '相棒のHP 50%以下' }).click();
const partnerRepairRow = program.locator('.sentence-block').filter({ hasText: 'ヒールする' });
await partnerRepairRow.locator('.word-slot').last().click();
const allyActionChoices = (await page.locator('.choice-list .instruction-choice-card').allInnerTexts()).map((text) =>
  text.replace(/\s+/g, ' ').trim(),
);
await page.locator('.instruction-choice-card').filter({ hasText: 'ヒールする' }).click();
const configuredRepairRow = program.locator('.sentence-block').filter({ hasText: 'ヒールする' });
await configuredRepairRow.getByRole('button', { name: '上へ移動' }).click();
const configuredProgram = (await program.innerText()).replace(/\s+/g, ' ').trim();
await configuredRepairRow.locator('.word-slot').first().click();
await page.screenshot({ path: '/tmp/code-monsters-healing-targets.png', fullPage: true });

await page.getByRole('button', { name: /戦闘開始/ }).click();
await page.getByRole('button', { name: 'x2' }).click();

let healSeen = false;
let healedTarget = '';
let healReadout = '';
for (let tick = 0; tick < 1400; tick += 1) {
  const actionReadout = page.locator('.battle-action-readout').first();
  const actionText = ((await actionReadout.textContent().catch(() => '')) ?? '').replace(/\s+/g, ' ').trim();
  if (actionText.includes('ヒール')) {
    const healingTarget = page.locator('.sprite.ally.is-focus-target').first();
    healSeen = true;
    healReadout = actionText;
    healedTarget = (await healingTarget.textContent())?.replace(/\s+/g, ' ').trim() ?? '';
    await page.screenshot({ path: '/tmp/code-monsters-healing.png', fullPage: true });
    break;
  }
  await page.waitForTimeout(30);
}

await page.waitForTimeout(200);
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
      healingCardCount,
      initialTargetChoices,
      targetMarkerContent,
      targetEffectBoxCount,
      conditionChoices,
      allyActionChoices,
      configuredProgram,
      healSeen,
      healReadout,
      healedTarget,
      healLog,
      errors,
    },
    null,
    2,
  ),
);

if (healingCardCount !== 0) throw new Error('初期所持の回復スキルがショップ候補に残っています');
if (!initialTargetChoices.some((choice) => choice.includes('相棒'))) throw new Error('相棒が回復対象にありません');
if (initialTargetChoices.length !== 3) throw new Error('2vs2で利用できない対象候補が表示されています');
if (targetMarkerContent !== 'none') throw new Error('対象スロットに点の装飾が残っています');
if (targetEffectBoxCount !== 0) throw new Error('対象カードに重複した対象ボックスが残っています');
if (
  conditionChoices.length !== 3 ||
  !conditionChoices.some((choice) => choice.includes('射程範囲内')) ||
  !conditionChoices.some((choice) => choice.includes('射程範囲外')) ||
  !conditionChoices.some((choice) => choice.includes('相棒のHP 50%以下')) ||
  conditionChoices.some((choice) => choice.includes('いつでも'))
)
  throw new Error('相棒対象の条件が2vs2向けに限定されていません');
if (
  !allyActionChoices.some((choice) => choice.includes('ヒールする')) ||
  allyActionChoices.some((choice) => choice.includes('前進する')) ||
  allyActionChoices.some((choice) => choice.includes('通常攻撃'))
)
  throw new Error('相棒対象に応じた回復アクションの絞り込みが不正です');
if (!configuredProgram.startsWith('1 もし このユニットから見て 相棒 が 相棒のHP 50%以下 なら ヒールする'))
  throw new Error('ヒールを相棒向けの通常作戦として設定できません');
if (!healSeen || !/(ヴォルト|メンダー)/.test(healedTarget)) throw new Error('戦闘中に相棒への回復を確認できません');
if (!healReadout.includes('ヒール') || !healReadout.includes('→'))
  throw new Error('回復の実行者・技・対象が戦闘中に表示されていません');
if (!healLog.includes('ヴォルト') || !healLog.includes('メンダー') || !/を (22|34) 修復/.test(healLog))
  throw new Error('ヒールが戦闘ログに記録されていません');
if (errors.length > 0) throw new Error(`ブラウザエラー: ${errors.join(', ')}`);
