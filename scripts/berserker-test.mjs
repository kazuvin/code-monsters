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

const genericBerserkerCards = await page
  .locator('.instruction-shop-item')
  .filter({ hasText: 'バーサーカーモード' })
  .count();
const wrathShopCard = page.locator('.shop-item').filter({ hasText: 'ラース' }).first();
const shopText = (await wrathShopCard.innerText()).replace(/\s+/g, ' ').trim();
await page.screenshot({ path: '/tmp/code-monsters-wrath-shop.png', fullPage: true });
await wrathShopCard.getByRole('button', { name: /購入/ }).click();
await page.locator('.inventory button').filter({ hasText: 'ラース' }).click();
await page.locator('.unit-tabs button').filter({ hasText: 'ラース' }).click();

const reactionBlock = page.locator('.reaction-code-block');
const fixedReaction = {
  text: (await reactionBlock.innerText()).replace(/\s+/g, ' ').trim(),
  triggerDisabled: await reactionBlock.locator('.word-slot').first().isDisabled(),
  actionDisabled: await reactionBlock.locator('.word-slot').last().isDisabled(),
  deleteDisabled: await reactionBlock.getByRole('button', { name: 'リアクションを削除' }).isDisabled(),
};

const normalProgram = page.locator('.workbench > .program-list').first();
await normalProgram.locator('.sentence-block').first().locator('.word-slot').last().click();
const normalActionChoices = await page.locator('.choice-list .instruction-choice-card').allTextContents();

for (const unitName of ['ヴォルト', 'バスティオン']) {
  await page.locator('.unit-tabs button').filter({ hasText: unitName }).click();
  await page.getByRole('button', { name: '外す' }).click();
}

await page.getByRole('button', { name: /戦闘開始/ }).click();
await page.getByRole('button', { name: 'x2' }).click();

let activationClassSeen = false;
let battleState = null;
for (let tick = 0; tick < 1200; tick += 1) {
  const wrathSprite = page.locator('.sprite.ally.unit-wrath').filter({ hasText: 'ラース' }).first();
  const className = await wrathSprite.getAttribute('class');
  if (className?.includes('is-berserk')) activationClassSeen = true;
  if (className?.includes('berserk-active')) {
    const wrathCard = page
      .locator('.status-group')
      .filter({ hasText: '味方ユニット' })
      .locator('.unit-status-card.unit-wrath')
      .first();
    battleState = await wrathCard.evaluate((element) => {
      const hpText = element.querySelector('.unit-status-hp b')?.textContent ?? '';
      const [hp, maxHp] = hpText.split('/').map(Number);
      const stats = Object.fromEntries(
        [...element.querySelectorAll('.status-stats span')].map((stat) => {
          const label = stat.childNodes[0]?.textContent?.trim() ?? '';
          return [label, Number(stat.querySelector('b')?.textContent)];
        }),
      );
      return {
        hp,
        maxHp,
        attack: stats.A,
        speed: stats.S,
        text: element.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      };
    });
    break;
  }
  await page.waitForTimeout(35);
}

const auraCount = await page.locator('.sprite.ally.unit-wrath.berserk-active .berserk-aura').count();
const chipCount = await page.locator('.sprite.ally.unit-wrath.berserk-active .berserk-chip').count();
await page.screenshot({ path: '/tmp/code-monsters-berserker-active.png', fullPage: true });
await page.waitForTimeout(700);
await page.getByRole('button', { name: /ログ/ }).click();
const berserkerLogs = await page
  .locator('.log-dialog .log.reaction')
  .filter({ hasText: 'バーサーカーモード' })
  .allTextContents();
await browser.close();

const result = {
  genericBerserkerCards,
  shopText,
  fixedReaction,
  normalActionChoices: normalActionChoices.map((text) => text.replace(/\s+/g, ' ').trim()),
  activationClassSeen,
  battleState,
  auraCount,
  chipCount,
  berserkerLogs,
  errors,
};
console.log(JSON.stringify(result, null, 2));

if (genericBerserkerCards !== 0) throw new Error('バーサーカーモードが汎用ショップ指示として残っています');
if (!shopText.includes('RARE') || !shopText.includes('ATK 20') || !shopText.includes('SPD 0.85'))
  throw new Error('ラースの基礎能力がショップに表示されていません');
if (!shopText.includes('固有リアクション') || !shopText.includes('HP 30%以下') || !shopText.includes('バーサーカー'))
  throw new Error('ラースの固有リアクションがショップに表示されていません');
if (!shopText.includes('ATK +60%') || !shopText.includes('SPD +200%'))
  throw new Error('ラースのバーサーカー効果が定量表示されていません');
if (!fixedReaction.text.includes('自分のHPが30%以下になったら') || !fixedReaction.text.includes('バーサーカーモード'))
  throw new Error('ラースの固定リアクションが不正です');
if (!fixedReaction.triggerDisabled || !fixedReaction.actionDisabled || !fixedReaction.deleteDisabled)
  throw new Error('ラースの固有リアクションを編集できてしまいます');
if (normalActionChoices.some((text) => text.includes('バーサーカーモード')))
  throw new Error('固有リアクションが通常ループに表示されています');
if (!battleState) throw new Error('ラースがバーサーカーモードに突入しませんでした');
if (battleState.hp <= 0 || battleState.hp / battleState.maxHp > 0.3)
  throw new Error(`HP 30%以下以外で発動しました: ${battleState.hp}/${battleState.maxHp}`);
if (battleState.attack !== 32 || battleState.speed !== 2.55)
  throw new Error(`ATK/SPDバフが不正です: ATK ${battleState.attack}, SPD ${battleState.speed}`);
if (!battleState.text.includes('暴走')) throw new Error('状態欄に暴走表示がありません');
if (!activationClassSeen || auraCount === 0 || chipCount === 0)
  throw new Error('バーサーカーの発動・常駐演出が確認できません');
if (
  berserkerLogs.length !== 1 ||
  !berserkerLogs[0].includes('ATK 20→32') ||
  !berserkerLogs[0].includes('SPD 0.85→2.55')
)
  throw new Error('ラースの定量ログが不正、または複数回発動しています');
if (errors.length > 0) throw new Error(`ブラウザエラー: ${errors.join(', ')}`);
