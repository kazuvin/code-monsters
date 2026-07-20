import { chromium } from 'playwright-core';

const targetUrl = process.argv[2] ?? 'http://127.0.0.1:5173/';
const browser = await chromium.launch({
  headless: true,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--use-angle=swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(5_000);
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await page.addInitScript(() => {
  Math.random = () => 1.25 / 0x7fffffff;
});
await page.goto(targetUrl, { waitUntil: 'networkidle' });

const initialShopItems = await page.locator('.shop-item').count();
const directSkillItems = await page.locator('.instruction-shop-item').count();
const pageTextBeforePurchase = (await page.locator('body').innerText()).replace(/\s+/g, ' ').trim();
const purchasedCard = page.locator('.instruction-shop-item').first();
const purchasedTitle = await purchasedCard.locator('strong').innerText();
const coinsBefore = Number.parseInt(await page.locator('.wallet b').innerText(), 10);
await purchasedCard.getByRole('button', { name: /購入/ }).click();
const reactionOnlyCard = page.locator('.instruction-shop-item').filter({ hasText: '追撃オーブを放つ' });
await reactionOnlyCard.getByRole('button', { name: /購入/ }).click();
const coinsAfter = Number.parseInt(await page.locator('.wallet b').innerText(), 10);
const remainingShopItems = await page.locator('.shop-item').count();

const firstProgramBlock = page.locator('.workbench > .program-list').first().locator('.sentence-block').first();
await firstProgramBlock.locator('.word-slot').last().click();
const purchasedChoiceVisible = await page
  .locator('.choice-list .instruction-choice-card')
  .filter({ hasText: purchasedTitle })
  .isVisible();
const reactionOnlyNormalChoices = await page
  .locator('.choice-list .instruction-choice-card')
  .filter({ hasText: '追撃オーブを放つ' })
  .count();
await page.getByRole('button', { name: /リアクションを追加/ }).click();
await page.locator('.reaction-code-block .word-slot').last().click();
const reactionOnlyReactionVisible = await page
  .locator('.choice-list .instruction-choice-card')
  .filter({ hasText: '追撃オーブを放つ' })
  .isVisible();
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
await page.screenshot({ path: '/tmp/code-monsters-skill-shop-desktop.png', fullPage: true });
await browser.close();

const result = {
  initialShopItems,
  directSkillItems,
  purchasedTitle,
  purchasedChoiceVisible,
  reactionOnlyNormalChoices,
  reactionOnlyReactionVisible,
  coinsBefore,
  coinsAfter,
  remainingShopItems,
  hasEquipmentCopy: pageTextBeforePurchase.includes('装備'),
  overflow,
  errors,
};
console.log(JSON.stringify(result, null, 2));

if (initialShopItems !== 4 || directSkillItems !== 4) throw new Error('ショップがスキル4件の直接販売ではありません');
if (!purchasedChoiceVisible) throw new Error('購入したスキルを作戦へ設定できません');
if (coinsAfter >= coinsBefore || remainingShopItems !== 2)
  throw new Error('スキル購入後のショップまたはコイン残高が不正です');
if (reactionOnlyNormalChoices !== 0 || !reactionOnlyReactionVisible)
  throw new Error('リアクション限定スキルの設定先が正しく制限されていません');
if (result.hasEquipmentCopy) throw new Error('廃止した装備表記が準備画面へ残っています');
if (overflow > 0 || errors.length > 0) throw new Error(`スキルショップUIエラー: ${errors.join(', ')}`);
