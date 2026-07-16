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

const tauntCard = page.locator('.instruction-shop-item').filter({ hasText: '挑発する' }).first();
const pullCard = page.locator('.instruction-shop-item').filter({ hasText: '引き寄せる' }).first();
const tauntShopText = (await tauntCard.innerText()).replace(/\s+/g, ' ').trim();
const pullShopText = (await pullCard.innerText()).replace(/\s+/g, ' ').trim();
await tauntCard.getByRole('button', { name: /購入/ }).click();
await pullCard.getByRole('button', { name: /購入/ }).click();

const program = page.locator('.workbench > .program-list').first();
const firstBlock = program.locator('.sentence-block').first();
await firstBlock.locator('.word-slot').last().click();
await page.locator('.choice-list .instruction-choice-card').filter({ hasText: '引き寄せる' }).click();
await firstBlock.locator('.word-slot').nth(1).click();
await page.locator('.choice-list .condition-choice-card').filter({ hasText: '攻撃射程外' }).click();
await firstBlock.locator('.word-slot').first().click();
const pullTargetChoices = await page.locator('.choice-list .target-choice-card').allInnerTexts();

const secondBlock = program.locator('.sentence-block').nth(1);
await secondBlock.locator('.word-slot').last().click();
await page.locator('.choice-list .instruction-choice-card').filter({ hasText: '挑発する' }).click();
await secondBlock.locator('.word-slot').first().click();
await page.locator('.choice-list .target-choice-card').filter({ hasText: '敵全体' }).click();
await page.locator('.choice-list .condition-choice-card').filter({ hasText: 'いつでも' }).click();
await secondBlock.locator('.word-slot').last().click();
const allEnemiesActionChoices = await page.locator('.choice-list .instruction-choice-card').allInnerTexts();

await program.locator('.add-block').click();
await page.locator('.choice-list .target-choice-card').filter({ hasText: '現在の標的' }).click();
await page.locator('.choice-list .condition-choice-card').filter({ hasText: '攻撃射程外' }).click();
const thirdBlock = program.locator('.sentence-block').nth(2);
await thirdBlock.locator('.word-slot').last().click();
await page.locator('.choice-list .instruction-choice-card').filter({ hasText: '前進する' }).click();
const configuredProgram = (await program.innerText()).replace(/\s+/g, ' ').trim();
await secondBlock.locator('.word-slot').first().click();
await page.screenshot({ path: '/tmp/code-monsters-target-slots.png', fullPage: true });

await page.getByRole('button', { name: /戦闘開始/ }).click();
await page.getByRole('button', { name: 'x2' }).click();

const teamLabelCount = await page.locator('.team-chip').count();
const teamColors = await page
  .locator('.team-ring')
  .evaluateAll((elements) => [...new Set(elements.map((element) => getComputedStyle(element).borderTopColor))]);
const teamOutlineFilters = await page
  .locator('.sprite-body')
  .evaluateAll((elements) => [...new Set(elements.map((element) => getComputedStyle(element).filter))]);

let tauntSeen = false;
let tauntLocked = false;
let pullSeen = false;
let pulledSeen = false;
let pullActivationDistance = 0;
let pullDistance = Number.POSITIVE_INFINITY;
let tauntAnimation = '';
let pullAnimation = '';
let pulledAnimation = '';
for (let tick = 0; tick < 900; tick += 1) {
  const tauntActor = page.locator('.sprite.ally.is-taunt').first();
  if ((await tauntActor.count()) > 0) {
    tauntSeen = true;
    tauntAnimation = await tauntActor
      .locator('.sprite-body')
      .evaluate((element) => getComputedStyle(element).animationName);
  }
  if ((await page.locator('.sprite.enemy.taunt-locked').count()) > 0) tauntLocked = true;

  const pullActor = page.locator('.sprite.ally.is-pull').first();
  if ((await pullActor.count()) > 0) {
    pullSeen = true;
    pullAnimation = await pullActor
      .locator('.sprite-body')
      .evaluate((element) => getComputedStyle(element).animationName);
    const pullTarget = page
      .locator('.sprite.enemy')
      .filter({ has: page.locator('.hit-spark') })
      .first();
    if ((await pullTarget.count()) > 0) {
      const actorX = Number.parseFloat((await pullActor.getAttribute('style'))?.match(/left:\s*([\d.]+)%/)?.[1] ?? '0');
      const targetX = Number.parseFloat(
        (await pullTarget.getAttribute('style'))?.match(/left:\s*([\d.]+)%/)?.[1] ?? '100',
      );
      pullActivationDistance = Math.max(pullActivationDistance, Math.abs(targetX - actorX));
    }
  }
  const pulledTarget = page.locator('.sprite.enemy.is-pulled').first();
  if ((await pulledTarget.count()) > 0) {
    pulledSeen = true;
    pulledAnimation = await pulledTarget
      .locator('.sprite-body')
      .evaluate((element) => getComputedStyle(element).animationName);
    const actorX = Number.parseFloat(
      (await page.locator('.sprite.ally.unit-volt').getAttribute('style'))?.match(/left:\s*([\d.]+)%/)?.[1] ?? '0',
    );
    const targetX = Number.parseFloat(
      (await pulledTarget.getAttribute('style'))?.match(/left:\s*([\d.]+)%/)?.[1] ?? '100',
    );
    pullDistance = Math.abs(targetX - actorX);
  }
  if (
    tauntSeen &&
    tauntLocked &&
    pullSeen &&
    pulledSeen &&
    pullActivationDistance > 20 &&
    pullActivationDistance <= 40.01 &&
    pullDistance <= 4.01
  )
    break;
  await page.waitForTimeout(35);
}

await page.screenshot({ path: '/tmp/code-monsters-control.png', fullPage: true });
await browser.close();

const result = {
  tauntShopText,
  pullShopText,
  configuredProgram,
  allEnemiesActionChoices,
  pullTargetChoices,
  teamLabelCount,
  teamColors,
  teamOutlineFilters,
  tauntSeen,
  tauntLocked,
  pullSeen,
  pulledSeen,
  pullActivationDistance,
  pullDistance,
  tauntAnimation,
  pullAnimation,
  pulledAnimation,
  errors,
};
console.log(JSON.stringify(result, null, 2));

if (
  !tauntShopText.includes('RARE / TAUNT') ||
  !tauntShopText.includes('効果 敵の標的→自分') ||
  !tauntShopText.includes('持続 5 s')
)
  throw new Error('挑発のショップ表示が不正です');
if (
  !pullShopText.includes('RARE / PULL') ||
  !pullShopText.includes('射程 40 m') ||
  !pullShopText.includes('着地 手前 4 m')
)
  throw new Error('引き寄せのショップ表示が不正です');
if (
  !configuredProgram.includes('敵全体 が いつでも なら 挑発する') ||
  !configuredProgram.includes('現在の標的 が 攻撃射程外 なら 引き寄せる') ||
  !configuredProgram.includes('現在の標的 が 攻撃射程外 なら 前進する')
)
  throw new Error('挑発と引き寄せを通常作戦へ設定できません');
if (
  !allEnemiesActionChoices.some((text) => text.includes('挑発する')) ||
  allEnemiesActionChoices.some((text) => text.includes('引き寄せる'))
)
  throw new Error('敵全体の対象に応じて行動候補が絞り込まれていません');
if (
  !pullTargetChoices.some((text) => text.includes('現在の標的')) ||
  !pullTargetChoices.some((text) => text.includes('HPが最も低い敵')) ||
  pullTargetChoices.some((text) => text.includes('敵全体') || text.includes('自分'))
)
  throw new Error('引き寄せる行動に応じて対象候補が絞り込まれていません');
if (teamLabelCount !== 0) throw new Error('敵味方ラベルが戦闘フィールドに残っています');
if (teamColors.length !== 2) throw new Error('敵味方の足元リングが同じ色です');
if (teamOutlineFilters.length < 2 || teamOutlineFilters.includes('none'))
  throw new Error('敵味方の輪郭光が区別できません');
if (!tauntSeen || !tauntLocked || !tauntAnimation.startsWith('ability-control-'))
  throw new Error('挑発の状態固定または戦闘アニメーションを確認できません');
if (!pullSeen || !pulledSeen || pullActivationDistance <= 20 || pullActivationDistance > 40.01 || pullDistance > 4.01)
  throw new Error('引き寄せがRNG×4の範囲から対象を使用者の近くへ移動できません');
if (!pullAnimation.startsWith('ability-control-') || !pulledAnimation.startsWith('ability-pulled-'))
  throw new Error('引き寄せの専用アニメーションを確認できません');
if (errors.length > 0) throw new Error(`ブラウザエラー: ${errors.join(', ')}`);
