import { chromium } from 'playwright-core';

const targetUrl = process.argv[2] ?? 'http://127.0.0.1:5173/';
const browser = await chromium.launch({
  headless: true,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--use-angle=swiftshader'],
});

const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.goto(targetUrl, { waitUntil: 'networkidle' });

const berserkerShopCard = page.locator('.shop-item').filter({ hasText: 'バーサーカーモード' }).first();
const shopText = (await berserkerShopCard.innerText()).replace(/\s+/g, ' ').trim();
await berserkerShopCard.getByRole('button', { name: /購入/ }).click();

const relayShopCard = page.locator('.shop-item').filter({ hasText: 'リレイ' }).first();
await relayShopCard.getByRole('button', { name: /購入/ }).click();
await page.locator('.inventory button').filter({ hasText: 'リレイ' }).click();
await page.locator('.unit-tabs button').filter({ hasText: 'リレイ' }).click();

const normalProgram = page.locator('.workbench > .program-list').first();
await normalProgram.locator('.sentence-block').first().locator('.word-slot').last().click();
const normalActionChoices = await page.locator('.choice-list .instruction-choice-card').allTextContents();

await page.getByRole('button', { name: /リアクションを追加/ }).click();
const reactionBlock = page.locator('.reaction-code-block');
await reactionBlock.locator('.word-slot').first().click();
const triggerCard = page.locator('.choice-list .condition-choice-card').filter({ hasText: 'HP 30%以下' }).first();
const triggerText = (await triggerCard.innerText()).replace(/\s+/g, ' ').trim();
await triggerCard.click();
await reactionBlock.locator('.word-slot').last().click();
const actionCard = page.locator('.choice-list .instruction-choice-card').filter({ hasText: 'バーサーカーモード' }).first();
const actionText = (await actionCard.innerText()).replace(/\s+/g, ' ').trim();
await actionCard.click();
const configuredReaction = (await reactionBlock.innerText()).replace(/\s+/g, ' ').trim();

for (const unitName of ['ヴォルト', 'バスティオン']) {
  await page.locator('.unit-tabs button').filter({ hasText: unitName }).click();
  await page.getByRole('button', { name: '外す' }).click();
}

await page.getByRole('button', { name: /戦闘開始/ }).click();
await page.getByRole('button', { name: 'x2' }).click();

let activationClassSeen = false;
let battleState = null;
for (let tick = 0; tick < 900; tick += 1) {
  const relaySprite = page.locator('.sprite.ally').filter({ hasText: 'リレイ' }).first();
  const className = await relaySprite.getAttribute('class');
  if (className?.includes('is-berserk')) activationClassSeen = true;
  if (className?.includes('berserk-active')) {
    const relayCard = page.locator('.status-group').filter({ hasText: '味方ユニット' }).locator('.unit-status-card').filter({ hasText: 'リレイ' }).first();
    battleState = await relayCard.evaluate(element => {
      const hpText = element.querySelector('.unit-status-hp b')?.textContent ?? '';
      const [hp, maxHp] = hpText.split('/').map(Number);
      const stats = Object.fromEntries([...element.querySelectorAll('.status-stats span')].map(stat => {
        const label = stat.childNodes[0]?.textContent?.trim() ?? '';
        return [label, Number(stat.querySelector('b')?.textContent)];
      }));
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

const auraCount = await page.locator('.sprite.ally.berserk-active .berserk-aura').count();
const chipCount = await page.locator('.sprite.ally.berserk-active .berserk-chip').count();
await page.screenshot({ path: '/tmp/code-monsters-berserker-active.png', fullPage: true });
await page.waitForTimeout(700);
await page.getByRole('button', { name: /ログ/ }).click();
const berserkerLogs = await page.locator('.log-dialog .log.reaction').filter({ hasText: 'バーサーカーモード' }).allTextContents();
await page.screenshot({ path: '/tmp/code-monsters-berserker.png', fullPage: true });
await browser.close();

const result = {
  shopText,
  triggerText,
  actionText,
  configuredReaction,
  normalActionChoices: normalActionChoices.map(text => text.replace(/\s+/g, ' ').trim()),
  activationClassSeen,
  battleState,
  auraCount,
  chipCount,
  berserkerLogs,
  errors,
};
console.log(JSON.stringify(result, null, 2));

if (!shopText.includes('理性は置いてきた') || !shopText.includes('ATK +60%') || !shopText.includes('SPD +50%')) throw new Error('ショップのバーサーカーカードに説明と定量効果がありません');
if (!triggerText.includes('自分のHP ≤ 30%')) throw new Error('HP 30%以下のリアクション条件が定量表示されていません');
if (!actionText.includes('ATK +60%') || !actionText.includes('SPD +50%')) throw new Error('バーサーカー選択カードの効果表示が不正です');
if (!configuredReaction.includes('自分のHPが30%以下になったら') || !configuredReaction.includes('バーサーカーモード')) throw new Error('バーサーカーのリアクション設定が反映されていません');
if (normalActionChoices.some(text => text.includes('バーサーカーモード'))) throw new Error('リアクション専用アクションが通常ループに表示されています');
if (!battleState) throw new Error('バーサーカーモードが戦闘中に発動しませんでした');
if (battleState.hp <= 0 || battleState.hp / battleState.maxHp > .3) throw new Error(`HP 30%以下以外で発動しました: ${battleState.hp}/${battleState.maxHp}`);
if (battleState.attack !== 34 || battleState.speed !== 1.83) throw new Error(`ATK/SPDバフが不正です: ATK ${battleState.attack}, SPD ${battleState.speed}`);
if (!battleState.text.includes('暴走')) throw new Error('状態欄に暴走表示がありません');
if (!activationClassSeen || auraCount === 0 || chipCount === 0) throw new Error('バーサーカーの発動・常駐演出が確認できません');
if (berserkerLogs.length !== 1 || !berserkerLogs[0].includes('ATK 21→34') || !berserkerLogs[0].includes('SPD 1.22→1.83')) throw new Error('バーサーカーの定量ログが不正、または複数回発動しています');
if (errors.length > 0) throw new Error(`ブラウザエラー: ${errors.join(', ')}`);
