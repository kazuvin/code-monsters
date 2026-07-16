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

const jumpCard = page.locator('.instruction-shop-item').filter({ hasText: '跳び越える' }).first();
const shopText = (await jumpCard.innerText()).replace(/\s+/g, ' ').trim();
await jumpCard.getByRole('button', { name: /購入/ }).click();

const firstProgramBlock = page.locator('.workbench > .program-list').first().locator('.sentence-block').first();
await firstProgramBlock.locator('.word-slot').last().click();
await page.locator('.choice-list .instruction-choice-card').filter({ hasText: '跳び越える' }).click();
const configuredProgram = (await firstProgramBlock.innerText()).replace(/\s+/g, ' ').trim();

await page.getByRole('button', { name: /戦闘開始/ }).click();
await page.getByRole('button', { name: 'x2' }).click();

let jumpSeen = false;
let crossedEnemy = false;
let jumpAnimation = '';
for (let tick = 0; tick < 900; tick += 1) {
  const volt = page.locator('.sprite.ally.unit-volt').first();
  const className = (await volt.getAttribute('class')) ?? '';
  if (className.includes('is-jump')) {
    jumpSeen = true;
    jumpAnimation = await volt.locator('.sprite-body').evaluate((element) => getComputedStyle(element).animationName);
    const voltX = Number.parseFloat((await volt.getAttribute('style'))?.match(/left:\s*([\d.]+)%/)?.[1] ?? '0');
    const enemyPositions = await page
      .locator('.sprite.enemy')
      .evaluateAll((elements) =>
        elements
          .filter((element) => !element.classList.contains('is-dead'))
          .map((element) => Number.parseFloat(element.style.left)),
      );
    if (enemyPositions.some((enemyX) => voltX > enemyX)) crossedEnemy = true;
  }
  if (jumpSeen && crossedEnemy) break;
  await page.waitForTimeout(35);
}

await browser.close();

const result = { shopText, configuredProgram, jumpSeen, crossedEnemy, jumpAnimation, errors };
console.log(JSON.stringify(result, null, 2));

if (!shopText.includes('RARE / JUMP') || !shopText.includes('跳躍 14 m') || !shopText.includes('通過 可能'))
  throw new Error('ジャンプ指示のショップ表示が不正です');
if (!configuredProgram.includes('一番近い敵 が 攻撃射程内') || !configuredProgram.includes('跳び越える'))
  throw new Error('ジャンプ指示を通常作戦へ設定できません');
if (!jumpSeen || !jumpAnimation.startsWith('ability-jump-'))
  throw new Error('ジャンプの戦闘アニメーションを確認できません');
if (!crossedEnemy) throw new Error('固定距離ジャンプで敵の背後へ移動できません');
if (errors.length > 0) throw new Error(`ブラウザエラー: ${errors.join(', ')}`);
