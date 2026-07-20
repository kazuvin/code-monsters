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
await page.addInitScript(() => {
  Math.random = () => 8.25 / 0x7fffffff;
});
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

let flightEventSeen = false;
let crossedEnemy = false;
let airborneSeen = false;
let cannedJumpSeen = false;
let flightAnimation = '';
const airborneXs = [];
const airborneZs = [];
for (let tick = 0; tick < 900; tick += 1) {
  const volt = page.locator('.sprite.ally.unit-volt').first();
  const className = (await volt.getAttribute('class')) ?? '';
  const isAirborne = (await volt.getAttribute('data-altitude')) === 'airborne';
  const voltX = Number.parseFloat((await volt.getAttribute('style'))?.match(/left:\s*([\d.]+)%/)?.[1] ?? '0');
  if (className.includes('is-jump')) cannedJumpSeen = true;
  if (className.includes('is-flight')) {
    flightEventSeen = true;
    flightAnimation = await volt.locator('.sprite-body').evaluate((element) => getComputedStyle(element).animationName);
  }
  if (isAirborne) {
    airborneSeen = true;
    airborneXs.push(voltX);
    airborneZs.push(
      Number.parseFloat((await volt.getAttribute('style'))?.match(/--air-height:\s*([\d.]+)px/)?.[1] ?? '0'),
    );
    const enemyPositions = await page
      .locator('.sprite.enemy')
      .evaluateAll((elements) =>
        elements
          .filter((element) => !element.classList.contains('is-dead'))
          .map((element) => Number.parseFloat(element.style.left)),
      );
    if (enemyPositions.some((enemyX) => voltX > enemyX)) crossedEnemy = true;
  }
  if (flightEventSeen && airborneSeen && crossedEnemy && !isAirborne) break;
  await page.waitForTimeout(35);
}

await browser.close();

const horizontalTravel = airborneXs.length > 0 ? Math.max(...airborneXs) - Math.min(...airborneXs) : 0;
const peakHeight = airborneZs.length > 0 ? Math.max(...airborneZs) : 0;
const result = {
  shopText,
  configuredProgram,
  flightEventSeen,
  airborneSeen,
  cannedJumpSeen,
  crossedEnemy,
  horizontalTravel,
  peakHeight,
  flightAnimation,
  errors,
};
console.log(JSON.stringify(result, null, 2));

if (
  !shopText.includes('RARE / JUMP') ||
  !shopText.includes('跳躍 28 m') ||
  !shopText.includes('高度 24 m') ||
  !shopText.includes('滞空 2 s')
)
  throw new Error('ジャンプ指示のショップ表示が不正です');
if (
  !configuredProgram.includes('このユニットから見て 対戦相手 が 射程範囲内') ||
  !configuredProgram.includes('跳び越える')
)
  throw new Error('ジャンプ指示を通常作戦へ設定できません');
if (!flightEventSeen) throw new Error('空中軌道の開始イベントを確認できません');
if (cannedJumpSeen || flightAnimation.startsWith('ability-jump-'))
  throw new Error('廃止したジャンプ専用アニメーションが再生されています');
if (!airborneSeen) throw new Error('ジャンプ後の滞空状態を戦闘表示で確認できません');
if (horizontalTravel < 18 || peakHeight < 20) throw new Error('ジャンプ軌道の距離または高さが不足しています');
if (!crossedEnemy) throw new Error('固定距離ジャンプで敵の背後へ移動できません');
if (errors.length > 0) throw new Error(`ブラウザエラー: ${errors.join(', ')}`);
